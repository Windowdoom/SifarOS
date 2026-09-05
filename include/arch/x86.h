#ifndef _ARCH_X86_H
#define _ARCH_X86_H

#include <kernel/types.h>

/* Segment selectors as laid out by gdt_init(). */
#define SEG_KCODE 0x08
#define SEG_KDATA 0x10
#define SEG_UCODE 0x18
#define SEG_UDATA 0x20
#define SEG_TSS   0x28

/* Register state pushed by the interrupt stubs in isr.S. */
struct registers {
    uint32_t ds;
    uint32_t edi, esi, ebp, esp_dummy, ebx, edx, ecx, eax;  /* pusha */
    uint32_t int_no, err_code;
    uint32_t eip, cs, eflags;
    uint32_t useresp, ss;                                   /* only on ring change */
} PACKED;

typedef void (*isr_handler_t)(struct registers *regs);

void gdt_init(void);
void tss_set_kernel_stack(uint32_t esp0);

void idt_init(void);
void fault_init(void);   /* exception handlers: kill user programs, trap kernel bugs */
void isr_register(uint8_t vector, isr_handler_t handler);
void isr_dispatch(struct registers *regs);   /* called from assembly */

void pic_init(void);
void pic_send_eoi(uint8_t irq);
void pic_mask_irq(uint8_t irq);
void pic_unmask_irq(uint8_t irq);

#define IRQ_BASE     32
#define IRQ_TIMER    0
#define IRQ_KEYBOARD 1

void     timer_init(uint32_t hz);
uint64_t timer_ticks(void);
uint32_t timer_hz(void);
uint64_t timer_ms(void);
void     timer_busy_wait(uint32_t ms);

void keyboard_init(void);
int  keyboard_trygetc(void);

/* Read the CPU vendor/brand via CPUID; buffers must hold 13 and 49 bytes. */
void cpu_identify(char *vendor, char *brand);
void cpu_reboot(void) __attribute__((noreturn));
void cpu_halt(void) __attribute__((noreturn));

#endif
