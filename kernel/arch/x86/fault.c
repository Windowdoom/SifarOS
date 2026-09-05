/*
 * CPU exception handling.
 *
 * The rule is simple: a fault in ring 3 kills that program and nothing else,
 * a fault in ring 0 is a kernel bug and stops the machine.  Without the first
 * half, any user program could take the whole system down with it.
 */
#include <arch/x86.h>
#include <kernel/kprintf.h>
#include <kernel/sched.h>
#include <kernel/mm.h>
#include <kernel/io.h>

static const char *fault_name(uint32_t vector)
{
    switch (vector) {
    case 0:  return "divide by zero";
    case 1:  return "debug";
    case 3:  return "breakpoint";
    case 4:  return "overflow";
    case 5:  return "bound range exceeded";
    case 6:  return "invalid opcode";
    case 7:  return "device not available";
    case 8:  return "double fault";
    case 10: return "invalid TSS";
    case 11: return "segment not present";
    case 12: return "stack-segment fault";
    case 13: return "general protection fault";
    case 14: return "page fault";
    case 16: return "x87 floating point";
    case 17: return "alignment check";
    case 19: return "SIMD floating point";
    default: return "exception";
    }
}

static int from_user(const struct registers *regs)
{
    return (regs->cs & 3) == 3;
}

static void dump(const struct registers *regs, uint32_t cr2)
{
    kprintf("  eip=%p cs=%p eflags=%p err=0x%x\n",
            (void *)regs->eip, (void *)regs->cs, (void *)regs->eflags,
            regs->err_code);
    kprintf("  eax=%p ebx=%p ecx=%p edx=%p\n",
            (void *)regs->eax, (void *)regs->ebx,
            (void *)regs->ecx, (void *)regs->edx);
    kprintf("  esi=%p edi=%p ebp=%p\n",
            (void *)regs->esi, (void *)regs->edi, (void *)regs->ebp);
    if (cr2)
        kprintf("  cr2=%p\n", (void *)cr2);
}

/* Terminate the current user program and go back to scheduling. */
static void kill_current(const struct registers *regs, uint32_t vector, uint32_t cr2)
{
    struct thread *t = thread_current();

    kprintf("\n[%s (tid %d) killed: %s", t ? t->name : "?", t ? t->tid : -1,
            fault_name(vector));
    if (vector == 14)
        kprintf(" at %p", (void *)cr2);
    kprintf(", eip %p]\n", (void *)regs->eip);

    thread_exit(-((int)vector));
}

static void page_fault(struct registers *regs)
{
    uint32_t cr2;

    __asm__ volatile("movl %%cr2, %0" : "=r"(cr2));

    if (from_user(regs)) {
        kill_current(regs, 14, cr2);
        return;
    }

    kprintf("\nPage fault in the kernel at %p\n", (void *)cr2);
    kprintf("  %s, %s, %s\n",
            (regs->err_code & 1) ? "protection violation" : "page not present",
            (regs->err_code & 2) ? "write" : "read",
            (regs->err_code & 16) ? "instruction fetch" : "data access");
    dump(regs, cr2);
    panic("unhandled kernel page fault");
}

static void generic_fault(struct registers *regs)
{
    if (from_user(regs)) {
        kill_current(regs, regs->int_no, 0);
        return;
    }

    kprintf("\nCPU exception %u in the kernel: %s\n", regs->int_no,
            fault_name(regs->int_no));
    dump(regs, 0);
    panic("unhandled kernel exception");
}

void fault_init(void)
{
    static const uint8_t vectors[] = { 0, 1, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13,
                                       16, 17, 18, 19 };

    for (size_t i = 0; i < ARRAY_SIZE(vectors); i++)
        isr_register(vectors[i], generic_fault);

    isr_register(14, page_fault);
}
