/*
 * Interrupt Descriptor Table: 32 CPU exception vectors, 16 remapped hardware
 * IRQs and the 0x80 syscall gate.
 */
#include <arch/x86.h>
#include <kernel/string.h>
#include <kernel/kprintf.h>
#include <kernel/io.h>
#include <kernel/sched.h>

struct idt_entry {
    uint16_t offset_low;
    uint16_t selector;
    uint8_t  zero;
    uint8_t  flags;
    uint16_t offset_high;
} PACKED;

struct idt_ptr {
    uint16_t limit;
    uint32_t base;
} PACKED;

#define IDT_ENTRIES 256

static struct idt_entry idt[IDT_ENTRIES];
static struct idt_ptr   idt_ptr;
static isr_handler_t    handlers[IDT_ENTRIES];

/* Stubs generated in isr.S */
extern void *isr_stub_table[];

static void set_gate(int vector, uint32_t handler, uint8_t flags)
{
    idt[vector].offset_low  = (uint16_t)(handler & 0xFFFF);
    idt[vector].offset_high = (uint16_t)((handler >> 16) & 0xFFFF);
    idt[vector].selector    = SEG_KCODE;
    idt[vector].zero        = 0;
    idt[vector].flags       = flags;
}

void isr_register(uint8_t vector, isr_handler_t handler)
{
    handlers[vector] = handler;
}

static const char *exception_name(uint32_t n)
{
    static const char *names[] = {
        "divide by zero", "debug", "non-maskable interrupt", "breakpoint",
        "overflow", "bound range exceeded", "invalid opcode",
        "device not available", "double fault", "coprocessor segment overrun",
        "invalid TSS", "segment not present", "stack-segment fault",
        "general protection fault", "page fault", "reserved",
        "x87 floating point", "alignment check", "machine check",
        "SIMD floating point", "virtualization", "control protection",
    };
    return (n < ARRAY_SIZE(names)) ? names[n] : "unknown exception";
}

/* Called from the common assembly stub with the saved register frame. */
void isr_dispatch(struct registers *regs)
{
    uint32_t n = regs->int_no;

    if (handlers[n]) {
        handlers[n](regs);
    } else if (n < 32) {
        kprintf("\nUnhandled exception %u: %s\n", n, exception_name(n));
        kprintf("  eip=%p cs=%p eflags=%p err=%u\n",
                (void *)regs->eip, (void *)regs->cs,
                (void *)regs->eflags, regs->err_code);
        kprintf("  eax=%p ebx=%p ecx=%p edx=%p\n",
                (void *)regs->eax, (void *)regs->ebx,
                (void *)regs->ecx, (void *)regs->edx);
        kprintf("  esi=%p edi=%p ebp=%p\n",
                (void *)regs->esi, (void *)regs->edi, (void *)regs->ebp);
        panic("fatal CPU exception");
    }

    if (n >= IRQ_BASE && n < IRQ_BASE + 16)
        pic_send_eoi((uint8_t)(n - IRQ_BASE));

    /* Preempt only after the PIC has been acknowledged. */
    sched_preempt();
}

void idt_init(void)
{
    memset(idt, 0, sizeof(idt));
    memset(handlers, 0, sizeof(handlers));

    /* 0x8E: present, ring 0, 32-bit interrupt gate. */
    for (int i = 0; i < 48; i++)
        set_gate(i, (uint32_t)isr_stub_table[i], 0x8E);

    /* 0xEE: same but callable from ring 3, for the syscall interface. */
    set_gate(0x80, (uint32_t)isr_stub_table[48], 0xEE);

    idt_ptr.limit = sizeof(idt) - 1;
    idt_ptr.base  = (uint32_t)&idt;
    __asm__ volatile("lidt %0" : : "m"(idt_ptr));
}
