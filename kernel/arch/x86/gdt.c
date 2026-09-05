/*
 * Global Descriptor Table.
 *
 * The bootloader installed a throwaway GDT; this is the real one.  It holds
 * flat ring 0 and ring 3 segments plus a task state segment, which the CPU
 * needs to know which stack to switch to when a user-mode interrupt fires.
 */
#include <arch/x86.h>
#include <kernel/string.h>

struct gdt_entry {
    uint16_t limit_low;
    uint16_t base_low;
    uint8_t  base_mid;
    uint8_t  access;
    uint8_t  granularity;   /* high limit nibble + flags */
    uint8_t  base_high;
} PACKED;

struct gdt_ptr {
    uint16_t limit;
    uint32_t base;
} PACKED;

struct tss_entry {
    uint32_t prev_tss;
    uint32_t esp0, ss0;
    uint32_t esp1, ss1;
    uint32_t esp2, ss2;
    uint32_t cr3, eip, eflags;
    uint32_t eax, ecx, edx, ebx, esp, ebp, esi, edi;
    uint32_t es, cs, ss, ds, fs, gs;
    uint32_t ldt;
    uint16_t trap, iomap_base;
} PACKED;

#define GDT_ENTRIES 6

static struct gdt_entry gdt[GDT_ENTRIES];
static struct gdt_ptr   gdt_ptr;
static struct tss_entry tss;

static void set_entry(int i, uint32_t base, uint32_t limit, uint8_t access, uint8_t flags)
{
    gdt[i].base_low    = (uint16_t)(base & 0xFFFF);
    gdt[i].base_mid    = (uint8_t)((base >> 16) & 0xFF);
    gdt[i].base_high   = (uint8_t)((base >> 24) & 0xFF);
    gdt[i].limit_low   = (uint16_t)(limit & 0xFFFF);
    gdt[i].granularity = (uint8_t)(((limit >> 16) & 0x0F) | (flags & 0xF0));
    gdt[i].access      = access;
}

void tss_set_kernel_stack(uint32_t esp0)
{
    tss.esp0 = esp0;
}

void gdt_init(void)
{
    uint32_t tss_base  = (uint32_t)&tss;
    uint32_t tss_limit = sizeof(tss) - 1;

    /* access bits: P | DPL | S | type   granularity: G | D/B | limit 19:16 */
    set_entry(0, 0, 0, 0, 0);
    set_entry(1, 0, 0x000FFFFF, 0x9A, 0xC0);    /* ring 0 code */
    set_entry(2, 0, 0x000FFFFF, 0x92, 0xC0);    /* ring 0 data */
    set_entry(3, 0, 0x000FFFFF, 0xFA, 0xC0);    /* ring 3 code */
    set_entry(4, 0, 0x000FFFFF, 0xF2, 0xC0);    /* ring 3 data */
    set_entry(5, tss_base, tss_limit, 0x89, 0x00);  /* 32-bit TSS, available */

    memset(&tss, 0, sizeof(tss));
    tss.ss0 = SEG_KDATA;
    tss.esp0 = 0;
    tss.iomap_base = sizeof(tss);   /* no I/O permission bitmap */

    gdt_ptr.limit = sizeof(gdt) - 1;
    gdt_ptr.base  = (uint32_t)&gdt;

    __asm__ volatile(
        "lgdt %0\n"
        "ljmp $0x08, $1f\n"
        "1:\n"
        "movw $0x10, %%ax\n"
        "movw %%ax, %%ds\n"
        "movw %%ax, %%es\n"
        "movw %%ax, %%fs\n"
        "movw %%ax, %%gs\n"
        "movw %%ax, %%ss\n"
        : : "m"(gdt_ptr) : "eax", "memory");

    __asm__ volatile("ltr %%ax" : : "a"((uint16_t)(SEG_TSS | 3)));
}
