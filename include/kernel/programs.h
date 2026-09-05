#ifndef _KERNEL_PROGRAMS_H
#define _KERNEL_PROGRAMS_H

#include <kernel/types.h>

/*
 * Programs linked into the kernel image.  These exist so the system has
 * something to run before a disk is mounted; everything else is loaded from
 * the filesystem.
 */
struct embedded_program {
    const char    *name;
    const char    *summary;
    const uint8_t *start;
    const uint8_t *end;
};

const struct embedded_program *program_find(const char *name);
const struct embedded_program *program_list(int *count);

#endif
