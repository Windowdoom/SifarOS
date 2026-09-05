/* CPUID identification, paging feature controls and system power helpers. */
#include <arch/x86.h>
#include <kernel/io.h>
#include <kernel/string.h>

#define CPUID_FEAT_EDX_MSR (1u << 5)
#define CPUID_FEAT_EDX_PAE (1u << 6)
#define CPUID_EXT_EDX_NX   (1u << 20)
#define MSR_EFER           0xC0000080u
#define EFER_NXE           (1ull << 11)

static void cpuid(uint32_t leaf, uint32_t *a, uint32_t *b, uint32_t *c, uint32_t *d)
{
    __asm__ volatile("cpuid"
                     : "=a"(*a), "=b"(*b), "=c"(*c), "=d"(*d)
                     : "a"(leaf), "c"(0));
}

static uint64_t rdmsr(uint32_t msr)
{
    uint32_t low, high;

    __asm__ volatile("rdmsr" : "=a"(low), "=d"(high) : "c"(msr));
    return ((uint64_t)high << 32) | low;
}

static void wrmsr(uint32_t msr, uint64_t value)
{
    __asm__ volatile("wrmsr"
                     :
                     : "c"(msr), "a"((uint32_t)value), "d"((uint32_t)(value >> 32))
                     : "memory");
}

int cpu_has_pae(void)
{
    uint32_t a, b, c, d;

    cpuid(0, &a, &b, &c, &d);
    if (a < 1)
        return 0;
    cpuid(1, &a, &b, &c, &d);
    return (d & CPUID_FEAT_EDX_PAE) != 0;
}

int cpu_has_nx(void)
{
    uint32_t a, b, c, d;
    uint32_t max_ext;

    cpuid(0x80000000u, &max_ext, &b, &c, &d);
    if (max_ext < 0x80000001u)
        return 0;
    cpuid(0x80000001u, &a, &b, &c, &d);
    return (d & CPUID_EXT_EDX_NX) != 0;
}

int cpu_enable_nx(void)
{
    uint32_t a, b, c, d;
    uint64_t efer;

    if (!cpu_has_nx())
        return -1;

    cpuid(1, &a, &b, &c, &d);
    if (!(d & CPUID_FEAT_EDX_MSR))
        return -1;

    efer = rdmsr(MSR_EFER);
    efer |= EFER_NXE;
    wrmsr(MSR_EFER, efer);
    return (rdmsr(MSR_EFER) & EFER_NXE) ? 0 : -1;
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
