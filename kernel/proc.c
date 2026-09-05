/*
 * Processes.
 *
 * A process owns an address space, a heap and one or more threads.  The
 * kernel itself is process 0 and keeps the kernel address space; everything
 * loaded from disk gets a private one, so a bug in an application can only
 * damage that application.
 */
#include <kernel/proc.h>
#include <kernel/elf.h>
#include <kernel/sched.h>
#include <kernel/mm.h>
#include <kernel/fs.h>
#include <kernel/kprintf.h>
#include <kernel/string.h>
#include <kernel/io.h>
#include <arch/x86.h>
#include <kernel/wm.h>
#include <sys/syscall.h>

#define USER_STACK_PAGES 16                     /* 64 KiB of user stack */
#define ARG_AREA_MAX     1024

extern void enter_usermode(uint32_t entry, uint32_t user_stack) __attribute__((noreturn));

static struct process  table[MAX_PROCESSES];
static struct process *kernel_process;
static int             next_pid = 1;

struct process *proc_kernel(void)  { return kernel_process; }

struct process *proc_current(void)
{
    struct thread *t = thread_current();

    if (t && t->proc)
        return (struct process *)t->proc;
    return kernel_process;
}

struct process *proc_by_pid(int pid)
{
    for (int i = 0; i < MAX_PROCESSES; i++) {
        if (table[i].state != PROC_FREE && table[i].pid == pid)
            return &table[i];
    }
    return NULL;
}

int proc_count(void)
{
    int n = 0;

    for (int i = 0; i < MAX_PROCESSES; i++) {
        if (table[i].state != PROC_FREE)
            n++;
    }
    return n;
}

void proc_foreach(void (*fn)(const struct process *, void *), void *ctx)
{
    for (int i = 0; i < MAX_PROCESSES; i++) {
        if (table[i].state != PROC_FREE)
            fn(&table[i], ctx);
    }
}

void proc_init(void)
{
    memset(table, 0, sizeof(table));

    kernel_process = &table[0];
    kernel_process->pid = 0;
    kernel_process->parent = 0;
    kernel_process->state = PROC_RUNNING;
    kernel_process->space = *vmm_kernel_space();
    strlcpy(kernel_process->name, "kernel", PROC_NAME_MAX);
    strlcpy(kernel_process->cwd, "/", FS_PATH_MAX);
}

static struct process *allocate(void)
{
    for (int i = 1; i < MAX_PROCESSES; i++) {
        if (table[i].state == PROC_FREE)
            return &table[i];
    }

    /* Recycle the oldest finished process nobody bothered to wait for. */
    for (int i = 1; i < MAX_PROCESSES; i++) {
        if (table[i].state == PROC_ZOMBIE && table[i].cleaned) {
            table[i].state = PROC_FREE;
            return &table[i];
        }
    }
    return NULL;
}

/* ------------------------------------------------------------ user memory */

int proc_user_range_ok(const void *ptr, size_t len)
{
    struct process *proc = proc_current();

    if (proc == kernel_process)
        return 0;                   /* kernel threads have no user memory */
    return vmm_access_ok_in(&proc->space, (virt_addr_t)(uintptr_t)ptr, len, 0);
}

int proc_user_write_ok(void *ptr, size_t len)
{
    struct process *proc = proc_current();

    if (proc == kernel_process)
        return 0;
    return vmm_access_ok_in(&proc->space, (virt_addr_t)(uintptr_t)ptr, len, 1);
}

int proc_copy_user_string(const char *user, char *out, size_t size)
{
    if (!out || size == 0)
        return -1;

    for (size_t i = 0; i + 1 < size; i++) {
        if (!proc_user_range_ok(user + i, 1))
            return -1;
        out[i] = user[i];
        if (!out[i])
            return (int)i;
    }
    out[size - 1] = '\0';
    return -1;
}

virt_addr_t proc_sbrk(int32_t increment)
{
    struct process *proc = proc_current();
    virt_addr_t previous;

    if (proc == kernel_process)
        return 0;

    previous = proc->brk;

    if (increment > 0) {
        uint32_t amount = (uint32_t)increment;
        virt_addr_t limit = proc->stack_top - (uint32_t)USER_STACK_PAGES * PAGE_SIZE;
        virt_addr_t target;
        uint32_t old_pages, new_pages;

        if (proc->brk > USER_MAX - amount)
            return 0;
        target = proc->brk + amount;
        if (target >= limit)
            return 0;               /* would run into the stack */
        old_pages = (uint32_t)((ALIGN_UP(previous, PAGE_SIZE) -
                                ALIGN_UP(proc->brk_start, PAGE_SIZE)) / PAGE_SIZE);
        new_pages = (uint32_t)((ALIGN_UP(target, PAGE_SIZE) -
                                ALIGN_UP(proc->brk_start, PAGE_SIZE)) / PAGE_SIZE);
        if (new_pages > old_pages) {
            size_t bytes = (size_t)(new_pages - old_pages) * PAGE_SIZE;
            if (vmm_alloc_range(&proc->space,
                                ALIGN_UP(previous, PAGE_SIZE), bytes,
                                PTE_WRITE | PTE_USER) < 0)
                return 0;
            proc->user_pages += new_pages - old_pages;
        }
        proc->brk = target;
        return previous;
    }

    if (increment < 0) {
        uint32_t amount = (uint32_t)(-(int64_t)increment);
        virt_addr_t target;
        uint32_t old_pages, new_pages;

        if (amount > proc->brk - proc->brk_start)
            return 0;
        target = proc->brk - amount;
        old_pages = (uint32_t)((ALIGN_UP(proc->brk, PAGE_SIZE) -
                                ALIGN_UP(proc->brk_start, PAGE_SIZE)) / PAGE_SIZE);
        new_pages = (uint32_t)((ALIGN_UP(target, PAGE_SIZE) -
                                ALIGN_UP(proc->brk_start, PAGE_SIZE)) / PAGE_SIZE);
        if (new_pages < old_pages) {
            size_t bytes = (size_t)(old_pages - new_pages) * PAGE_SIZE;
            vmm_free_range(&proc->space,
                           ALIGN_UP(target, PAGE_SIZE), bytes);
            proc->user_pages -= old_pages - new_pages;
        }
        proc->brk = target;
    }

    return previous;
}
