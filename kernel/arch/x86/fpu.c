/*
 * Floating point support.
 *
 * The x87 and SSE register files are as much a part of a thread's context as
 * the general purpose registers, so they are saved and restored on every
 * switch.  Without this, two programs doing arithmetic at the same time would
 * quietly corrupt each other's numbers.
 */
#include <arch/x86.h>
#include <kernel/mm.h>
#include <kernel/string.h>
#include <kernel/kprintf.h>

static int      sse_available;
static uint8_t  clean_state[512] __attribute__((aligned(16)));

int fpu_present(void)
{
    return 1;
}

int fpu_sse(void)
{
    return sse_available;
}

void fpu_init(void)
{
    uint32_t a, b, c, d;
    uint32_t cr0, cr4;

    __asm__ volatile("cpuid" : "=a"(a), "=b"(b), "=c"(c), "=d"(d) : "a"(1), "c"(0));
    sse_available = (d & (1u << 25)) != 0;      /* SSE */

    __asm__ volatile("movl %%cr0, %0" : "=r"(cr0));
    cr0 &= ~(1u << 2);          /* EM: let x87 instructions execute */
    cr0 |= (1u << 1);           /* MP: monitor coprocessor */
    cr0 |= (1u << 5);           /* NE: native exception reporting */
    __asm__ volatile("movl %0, %%cr0" : : "r"(cr0));

    if (sse_available) {
        __asm__ volatile("movl %%cr4, %0" : "=r"(cr4));
        cr4 |= (1u << 9) | (1u << 10);          /* OSFXSR | OSXMMEXCPT */
        __asm__ volatile("movl %0, %%cr4" : : "r"(cr4));
    }

    __asm__ volatile("fninit");

    /* Keep a pristine copy to hand to every new thread. */
    memset(clean_state, 0, sizeof(clean_state));
    if (sse_available)
        __asm__ volatile("fxsave (%0)" : : "r"(clean_state) : "memory");
}

void fpu_new_state(void *state)
{
    memcpy(state, clean_state, 512);
}

void fpu_save(void *state)
{
    if (sse_available && state)
        __asm__ volatile("fxsave (%0)" : : "r"(state) : "memory");
}

void fpu_restore(const void *state)
{
    if (sse_available && state)
        __asm__ volatile("fxrstor (%0)" : : "r"(state) : "memory");
}
