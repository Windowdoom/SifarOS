#ifndef _KERNEL_PROC_H
#define _KERNEL_PROC_H

#include <kernel/types.h>
#include <kernel/mm.h>
#include <kernel/fs.h>

#define PROC_NAME_MAX 32
#define MAX_PROCESSES 32

/* Kernel-granted privileges. They are deliberately not inherited by child
 * processes and there is no userspace syscall for granting or restoring them. */
#define PROC_CAP_WINDOW_CONTROL  0x00000001u
#define PROC_CAP_SYSTEM_CONTROL  0x00000002u
#define PROC_CAP_PROCESS_CONTROL 0x00000004u
#define PROC_CAP_PROCESS_INSPECT 0x00000008u
#define PROC_CAP_NETWORK         0x00000010u
#define PROC_CAP_ALL             (PROC_CAP_WINDOW_CONTROL | PROC_CAP_SYSTEM_CONTROL | \
                                  PROC_CAP_PROCESS_CONTROL | PROC_CAP_PROCESS_INSPECT | \
                                  PROC_CAP_NETWORK)

enum proc_state {
    PROC_FREE = 0,
    PROC_RUNNING,
    PROC_ZOMBIE,
};

struct process {
    int               pid;
    int               parent;
    char              name[PROC_NAME_MAX];
    struct addr_space space;
    enum proc_state   state;
    int               exit_code;
    int               main_tid;
    virt_addr_t       brk_start;
    virt_addr_t       brk;          /* current end of the user heap */
    virt_addr_t       stack_top;
    char              cwd[FS_PATH_MAX];
    uint64_t          started_ms;
    uint32_t          user_pages;
    uint32_t          capabilities;
    uint8_t           cleaned;      /* address space already released */
};

void            proc_init(void);
struct process *proc_current(void);
struct process *proc_kernel(void);
struct process *proc_by_pid(int pid);
int             proc_count(void);
void            proc_foreach(void (*fn)(const struct process *, void *), void *ctx);

/* Capabilities may only be changed by kernel code; no user syscall exposes
 * this interface. Revocation is used by Sentinel for quarantine/isolation. */
int  proc_grant_caps(int pid, uint32_t caps);
int  proc_revoke_caps(int pid, uint32_t caps);
int  proc_has_cap(const struct process *proc, uint32_t cap);

/* Load an executable and start it. Returns the new pid, or a negative error. */
int  proc_spawn(const char *path, int argc, const char *const *argv);
int  proc_spawn_image(const char *name, const uint8_t *image, size_t size,
                      int argc, const char *const *argv);

int  proc_wait(int pid, int *exit_code);
int  proc_try_wait(int pid, int *exit_code);   /* 1 when finished, 0 if running */
int  proc_kill(int pid);
void proc_exit(int code) __attribute__((noreturn));
void proc_reap(void);           /* release finished processes, runs on idle */

/* Grow or shrink the current process heap; returns the previous break. */
virt_addr_t proc_sbrk(int32_t increment);

/* Pointer checking for syscalls. */
int  proc_user_range_ok(const void *ptr, size_t len);       /* kernel reads */
int  proc_user_write_ok(void *ptr, size_t len);             /* kernel writes */
int  proc_copy_user_string(const char *user, char *out, size_t size);

void syscall_init(void);

#endif
