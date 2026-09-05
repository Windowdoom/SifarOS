/*
 * The user programs that ship inside the kernel image.
 *
 * Each one is built from user/ as a flat binary and turned into an object
 * file by objcopy, which is where these _binary_* symbols come from.
 */
#include <kernel/proc.h>
#include <kernel/string.h>

#define DECLARE_PROGRAM(sym)                        \
    extern const uint8_t _binary_##sym##_bin_start[]; \
    extern const uint8_t _binary_##sym##_bin_end[]

DECLARE_PROGRAM(hello);
DECLARE_PROGRAM(counter);
DECLARE_PROGRAM(faulter);

#define PROGRAM(sym, text)                          \
    { #sym, text, _binary_##sym##_bin_start, _binary_##sym##_bin_end }

static const struct embedded_program programs[] = {
    PROGRAM(hello,   "greets you from ring 3 and touches the filesystem"),
    PROGRAM(counter, "counts to five, sleeping between lines"),
    PROGRAM(faulter, "reads kernel memory on purpose and gets killed for it"),
};

const struct embedded_program *program_find(const char *name)
{
    for (size_t i = 0; i < ARRAY_SIZE(programs); i++) {
        if (strcmp(programs[i].name, name) == 0)
            return &programs[i];
    }
    return NULL;
}

const struct embedded_program *program_list(int *count)
{
    if (count)
        *count = (int)ARRAY_SIZE(programs);
    return programs;
}
