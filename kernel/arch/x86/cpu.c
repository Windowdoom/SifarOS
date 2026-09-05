/* CPUID identification plus the two ways out of the operating system. */
#include <arch/x86.h>
#include <kernel/io.h>
#include <kernel/string.h>

static void cpuid(uint32_t leaf, uint32_t *a, uint32_t *b, uint32_t *c, uint32_t *d)
{
    __asm__ volatile("cpuid"
                     : "=a"(*a), "=b"(*b), "=c"(*c), "=d"(*d)
                     : "a"(leaf), "c"(0));
}

void cpu_identify(char *vendor, char *brand)
{
    uint32_t a, b, c, d;

    if (vendor) {
        cpuid(0, &a, &b, &c, &d);
        memcpy(vendor + 0, &b, 4);
        memcpy(vendor + 4, &d, 4);
        memcpy(vendor + 8, &c, 4);
        vendor[12] = '\0';
    }

    if (brand) {
        uint32_t max_ext;
        cpuid(0x80000000u, &max_ext, &b, &c, &d);
        if (max_ext >= 0x80000004u) {
            for (uint32_t leaf = 0x80000002u; leaf <= 0x80000004u; leaf++) {
                cpuid(leaf, &a, &b, &c, &d);
                char *p = brand + (leaf - 0x80000002u) * 16;
                memcpy(p + 0, &a, 4);
                memcpy(p + 4, &b, 4);
                memcpy(p + 8, &c, 4);
                memcpy(p + 12, &d, 4);
            }
            brand[48] = '\0';
        } else {
            strcpy(brand, "unknown");
        }
    }
}

/* Pulse the keyboard controller's reset line, the classic way to reboot. */
void cpu_reboot(void)
{
    uint8_t status;

    cli();
    do {
        status = inb(0x64);
        if (status & 0x01)
            (void)inb(0x60);        /* drain the output buffer first */
    } while (status & 0x02);

    outb(0x64, 0xFE);

    /* If that did not take, triple fault by loading a null IDT. */
    {
        struct { uint16_t limit; uint32_t base; } PACKED null_idt = { 0, 0 };
        __asm__ volatile("lidt %0; int $0x03" : : "m"(null_idt));
    }
    for (;;)
        hlt();
}

void cpu_halt(void)
{
    cli();
    /* QEMU/Bochs shutdown ports, harmless on real hardware. */
    outw(0x604, 0x2000);
    outw(0xB004, 0x2000);
    outw(0x4004, 0x3400);
    for (;;)
        hlt();
}
