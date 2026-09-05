/*
 * Deliberately misbehaving program: it reaches for kernel memory.  The
 * expected outcome is that the CPU faults, the kernel kills this program, and
 * the shell keeps running.
 */
#include "ulib.h"

int main(void)
{
    volatile unsigned int *kernel_memory = (volatile unsigned int *)0x00010000;

    puts("faulter: about to read kernel memory at 0x00010000\n");
    puts("faulter: if the kernel is doing its job, this is my last line\n");

    unsigned int stolen = *kernel_memory;

    printf("faulter: protection failed, I read 0x%x\n", stolen);
    return 1;
}
