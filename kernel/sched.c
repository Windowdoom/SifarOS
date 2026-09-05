/*
 * Round-robin preemptive scheduler.
 *
 * Every thread owns a kernel stack allocated from the heap. The timer IRQ
 * marks the running thread for preemption; the actual switch happens at the
 * tail of interrupt dispatch, after the interrupt controller has been
 * acknowledged, so the next thread starts life with a clean interrupt state.
 *
 * Sifar Adaptive Core may tune the round-robin quantum at runtime. The
 * scheduler itself enforces hard bounds so policy cannot accidentally turn
 * adaptation into starvation or pathological context-switch churn.
 */
#include <kernel/sched.h>
#include <kernel/mm.h>
#include <kernel/kprintf.h>
#include <kernel/string.h>
#include <kernel/io.h>
#include <arch/x86.h>
#include <kernel/proc.h>

#define STACK_SIZE       (32 * KB)
#define STACK_GUARD      0x5A11B0DEu
#define QUANTUM_DEFAULT  5u
#define QUANTUM_MIN      1u
#define QUANTUM_MAX      12u

extern void context_switch(uint32_t *save_esp, uint32_t new_esp);
extern void thread_trampoline(void);

static struct thread *threads[MAX_THREADS];
static struct thread *current;
static struct thread  boot_thread;
static int            next_tid = 1;
static int            running;
static int            need_resched;
static uint32_t       quantum_ticks = QUANTUM_DEFAULT;
static int            slice_left = (int)QUANTUM_DEFAULT;

#define EXIT_HISTORY 32
static struct { int tid; int code; } exit_history[EXIT_HISTORY];
static int exit_history_next;

static void remember_exit(int tid, int code)
{
    exit_history[exit_history_next].tid = tid;
    exit_history[exit_history_next].code = code;
    exit_history_next = (exit_history_next + 1) % EXIT_HISTORY;
}

static int recall_exit(int tid, int *code)
{
    for (int i = 0; i < EXIT_HISTORY; i++) {
        if (exit_history[i].tid == tid) {
            *code = exit_history[i].code;
            return 1;
        }
    }
    return 0;
}

const char *thread_state_name(enum thread_state state)
{
    switch (state) {
    case THREAD_READY:    return "ready";
    case THREAD_RUNNING:  return "running";
    case THREAD_SLEEPING: return "sleeping";
    case THREAD_BLOCKED:  return "blocked";
    case THREAD_ZOMBIE:   return "zombie";
    default:              return "?";
    }
}

struct thread *thread_current(void)
{
    return current;
}

int sched_enabled(void)
{
    return running;
}

int thread_count(void)
{
    int n = 0;

    for (int i = 0; i < MAX_THREADS; i++) {
        if (threads[i])
            n++;
    }
    return n;
}

void sched_foreach(void (*fn)(const struct thread *, void *), void *ctx)
{
    for (int i = 0; i < MAX_THREADS; i++) {
        if (threads[i])
            fn(threads[i], ctx);
    }
}

void sched_set_quantum_ticks(uint32_t ticks)
{
    uint32_t flags;

    if (ticks < QUANTUM_MIN)
        ticks = QUANTUM_MIN;
    if (ticks > QUANTUM_MAX)
        ticks = QUANTUM_MAX;

    flags = irq_save();
    quantum_ticks = ticks;
    if (slice_left > (int)ticks)
        slice_left = (int)ticks;
    irq_restore(flags);
}

uint32_t sched_quantum_ticks(void)
{
    return quantum_ticks;
}

/* The kernel's initial control flow becomes thread 0. */
void sched_init(void)
{
    memset(&boot_thread, 0, sizeof(boot_thread));
    boot_thread.tid   = 0;
    boot_thread.state = THREAD_RUNNING;
    boot_thread.space = vmm_kernel_space();
    {
        static uint8_t boot_fpu[512 + 16];

        boot_thread.fpu_state = (void *)ALIGN_UP((uintptr_t)boot_fpu, 16);
        fpu_new_state(boot_thread.fpu_state);
    }
    strlcpy(boot_thread.name, "kernel", THREAD_NAME_MAX);

    threads[0] = &boot_thread;
    current = &boot_thread;
    quantum_ticks = QUANTUM_DEFAULT;
    slice_left = (int)quantum_ticks;
    running = 1;
}

int thread_create(const char *name, thread_entry_t entry, void *arg)
{
    struct thread *t;
    uint32_t *sp;
    uint32_t flags;
    int slot = -1;

    flags = irq_save();
    for (int i = 0; i < MAX_THREADS; i++) {
        if (!threads[i]) {
            slot = i;
            break;
        }
    }
    irq_restore(flags);

    if (slot < 0)
        return -1;

    t = (struct thread *)kmalloc(sizeof(*t));
    if (!t)
        return -1;

    memset(t, 0, sizeof(*t));
    t->stack_base = (uint32_t)kmalloc(STACK_SIZE);
    if (!t->stack_base) {
        kfree(t);
        return -1;
    }
    t->stack_size = STACK_SIZE;
    *(uint32_t *)t->stack_base = STACK_GUARD;

    {
        uint8_t *raw = (uint8_t *)kmalloc(512 + 16);

        if (!raw) {
            kfree((void *)t->stack_base);
            kfree(t);
            return -1;
        }
        t->fpu_state = (void *)ALIGN_UP((uintptr_t)raw, 16);
        fpu_new_state(t->fpu_state);
    }
    t->tid = next_tid++;
    t->state = THREAD_READY;
    t->detached = 1;
    t->space = current ? current->space : vmm_kernel_space();
    t->proc = NULL;
    strlcpy(t->name, name, THREAD_NAME_MAX);

    sp = (uint32_t *)(t->stack_base + STACK_SIZE);
    *--sp = (uint32_t)thread_trampoline;
    *--sp = 0;
    *--sp = 0;
    *--sp = (uint32_t)entry;
    *--sp = (uint32_t)arg;
    *--sp = 0x00000202;
    t->esp = (uint32_t)sp;

    flags = irq_save();
    threads[slot] = t;
    irq_restore(flags);

    return t->tid;
}

static struct thread *pick_next(void)
{
    int start = 0;

    for (int i = 0; i < MAX_THREADS; i++) {
        if (threads[i] == current) {
            start = i;
            break;
        }
    }

    for (int step = 1; step <= MAX_THREADS; step++) {
        struct thread *t = threads[(start + step) % MAX_THREADS];

        if (t && t->state == THREAD_READY)
            return t;
    }

    if (current->state == THREAD_RUNNING || current->state == THREAD_READY)
        return current;
    return threads[0];
}

static void switch_to(struct thread *next)
{
    struct thread *prev = current;

    if (next == prev) {
        if (prev->state == THREAD_READY)
            prev->state = THREAD_RUNNING;
        return;
    }

    if (prev->state == THREAD_RUNNING)
        prev->state = THREAD_READY;
    next->state = THREAD_RUNNING;
    current = next;
    slice_left = (int)quantum_ticks;

    if (prev->stack_base && *(uint32_t *)prev->stack_base != STACK_GUARD)
        panic("thread %d (%s) overflowed its kernel stack", prev->tid, prev->name);

    if (prev->fpu_state)
        fpu_save(prev->fpu_state);
    if (next->fpu_state)
        fpu_restore(next->fpu_state);

    if (next->space && next->space != vmm_current_space())
        vmm_space_switch(next->space);

    tss_set_kernel_stack(next->stack_base ?
                         next->stack_base + next->stack_size : 0);

    context_switch(&prev->esp, next->esp);
}

void sched_yield(void)
{
    uint32_t flags;

    if (!running)
        return;

    flags = irq_save();
    need_resched = 0;
    switch_to(pick_next());
    irq_restore(flags);
}

void sched_tick(void)
{
    uint64_t now;

    if (!running)
        return;

    current->cpu_ticks++;
    now = timer_ms();

    for (int i = 0; i < MAX_THREADS; i++) {
        struct thread *t = threads[i];

        if (t && t->state == THREAD_SLEEPING && now >= t->wake_at_ms)
            t->state = THREAD_READY;
    }

    if (--slice_left <= 0) {
        slice_left = (int)quantum_ticks;
        need_resched = 1;
    }
}

void sched_preempt(void)
{
    if (!running || !need_resched)
        return;
    need_resched = 0;
    switch_to(pick_next());
}

void thread_sleep_ms(uint32_t ms)
{
    uint32_t flags;

    if (!running) {
        timer_busy_wait(ms);
        return;
    }

    flags = irq_save();
    current->wake_at_ms = timer_ms() + ms;
    current->state = THREAD_SLEEPING;
    switch_to(pick_next());
    irq_restore(flags);
}

void thread_exit(int code)
{
    cli();

    if (current->proc) {
        struct process *proc = (struct process *)current->proc;

        if (proc->main_tid == current->tid && proc->state == PROC_RUNNING) {
            proc->exit_code = code;
            proc->state = PROC_ZOMBIE;
        }
    }

    current->exit_code = code;
    current->state = THREAD_ZOMBIE;
    remember_exit(current->tid, code);
    switch_to(pick_next());
    panic("thread_exit: scheduled a dead thread (tid %d)", current->tid);
}

int thread_join(int tid)
{
    for (;;) {
        uint32_t flags = irq_save();
        struct thread *found = NULL;

        for (int i = 0; i < MAX_THREADS; i++) {
            if (threads[i] && threads[i]->tid == tid) {
                found = threads[i];
                break;
            }
        }
        irq_restore(flags);

        if (!found) {
            int code = 0;

            recall_exit(tid, &code);
            return code;
        }

        flags = irq_save();
        found->detached = 0;
        if (found->state == THREAD_ZOMBIE) {
            int code = found->exit_code;

            found->detached = 1;
            irq_restore(flags);
            return code;
        }
        irq_restore(flags);
        sched_yield();
    }
}

int thread_exists(int tid)
{
    uint32_t flags = irq_save();
    int found = 0;

    for (int i = 0; i < MAX_THREADS; i++) {
        if (threads[i] && threads[i]->tid == tid) {
            found = 1;
            break;
        }
    }
    irq_restore(flags);
    return found;
}

int thread_kill(int tid)
{
    uint32_t flags = irq_save();
    int result = -1;

    for (int i = 0; i < MAX_THREADS; i++) {
        struct thread *t = threads[i];

        if (t && t->tid == tid && t->tid != 0 && t->state != THREAD_ZOMBIE) {
            t->state = THREAD_ZOMBIE;
            t->exit_code = -1;
            remember_exit(tid, -1);
            result = 0;
            break;
        }
    }
    irq_restore(flags);

    if (result == 0 && current->tid == tid)
        sched_yield();
    return result;
}

void sched_reap(void)
{
    uint32_t flags = irq_save();

    for (int i = 1; i < MAX_THREADS; i++) {
        struct thread *t = threads[i];

        if (t && t->state == THREAD_ZOMBIE && t != current && t->detached) {
            threads[i] = NULL;
            irq_restore(flags);
            kfree((void *)t->stack_base);
            kfree(t);
            flags = irq_save();
        }
    }
    irq_restore(flags);
}
