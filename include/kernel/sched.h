#ifndef _KERNEL_SCHED_H
#define _KERNEL_SCHED_H

#include <kernel/types.h>

#define THREAD_NAME_MAX 24
#define MAX_THREADS     32

enum thread_state {
    THREAD_READY = 0,
    THREAD_RUNNING,
    THREAD_SLEEPING,
    THREAD_BLOCKED,
    THREAD_ZOMBIE,
};

typedef void (*thread_entry_t)(void *arg);

struct addr_space;

struct thread {
    uint32_t          esp;              /* saved stack pointer - must stay first */
    uint32_t          stack_base;
    uint32_t          stack_size;
    int               tid;
    char              name[THREAD_NAME_MAX];
    enum thread_state state;
    uint64_t          wake_at_ms;
    uint64_t          cpu_ticks;
    int               exit_code;
    uint8_t           detached;      /* 0 while a joiner owns the corpse */
    uint8_t           user;          /* runs a ring 3 program */
    void             *proc;          /* struct process *, NULL for the kernel */
    void             *fpu_state;     /* 512 byte FXSAVE area, 16 byte aligned */
    struct addr_space *space;        /* address space to install on switch */
};

void            sched_init(void);
int             thread_create(const char *name, thread_entry_t entry, void *arg);
void            sched_yield(void);
void            sched_tick(void);           /* called from the timer IRQ */
void            sched_preempt(void);        /* called at the end of isr_dispatch */
void            thread_sleep_ms(uint32_t ms);
void            thread_exit(int code) __attribute__((noreturn));
int             thread_join(int tid);
int             thread_kill(int tid);
int             thread_exists(int tid);
struct thread  *thread_current(void);
int             thread_count(void);
int             sched_enabled(void);
void            sched_foreach(void (*fn)(const struct thread *, void *), void *ctx);
void            sched_reap(void);           /* free finished threads */
const char     *thread_state_name(enum thread_state state);

#endif
