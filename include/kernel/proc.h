#ifndef _KERNEL_PROC_H
#define _KERNEL_PROC_H

#include <kernel/types.h>

/*
 * A "process" here is a kernel thread that has dropped to ring 3 with a
 * private set of user pages.  Only one runs at a time: the kernel keeps a
 * single address space, so user programs take turns at USER_BASE.
 */
int  proc_spawn(const char *name, const uint8_t *image, size_t size);
int  proc_wait(int tid);        /* join, then tear the user mapping down */
int  proc_active(void);
void syscall_init(void);

/* Programs linked into the kernel image (see user/). */
struct embedded_program {
    const char    *name;
    const char    *summary;
    const uint8_t *start;
    const uint8_t *end;
};

const struct embedded_program *program_find(const char *name);
const struct embedded_program *program_list(int *count);

#endif
