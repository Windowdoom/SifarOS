/*
 * Physical memory manager: one bit per 4 KiB frame.
 *
 * The bitmap is parked immediately after the kernel image, and everything
 * below that (real mode IVT, BIOS data, the bootloader, the kernel itself)
 * stays permanently reserved.  Everything the BIOS reported as usable RAM
 * above the bitmap becomes allocatable.
 */
#include <kernel/mm.h>
#include <kernel/kprintf.h>
#include <kernel/string.h>
#include <kernel/io.h>

extern uint8_t __kernel_end[];      /* provided by the linker script */

static uint32_t *bitmap;
static uint32_t  bitmap_words;
static uint32_t  total_frames;
static uint32_t  used_frames;
static uint64_t  total_bytes;

/* Highest physical address we are willing to manage (keeps the bitmap sane). */
#define MAX_PHYS 0xFFFF0000ull

static inline void bit_set(uint32_t frame)
{
    bitmap[frame >> 5] |= 1u << (frame & 31);
}

static inline void bit_clear(uint32_t frame)
{
    bitmap[frame >> 5] &= ~(1u << (frame & 31));
}

static inline int bit_test(uint32_t frame)
{
    return (bitmap[frame >> 5] >> (frame & 31)) & 1u;
}

static void mark_used(phys_addr_t base, uint64_t length)
{
    uint32_t first = base >> PAGE_SHIFT;
    uint32_t last  = (uint32_t)((base + length + PAGE_SIZE - 1) >> PAGE_SHIFT);

    for (uint32_t f = first; f < last && f < total_frames; f++) {
        if (!bit_test(f)) {
            bit_set(f);
            used_frames++;
        }
    }
}

static void mark_free(phys_addr_t base, uint64_t length)
{
    uint32_t first = (uint32_t)((base + PAGE_SIZE - 1) >> PAGE_SHIFT);
    uint32_t last  = (uint32_t)((base + length) >> PAGE_SHIFT);

    for (uint32_t f = first; f < last && f < total_frames; f++) {
        if (bit_test(f)) {
            bit_clear(f);
            used_frames--;
        }
    }
}

const char *e820_type_name(uint32_t type)
{
    switch (type) {
    case E820_USABLE:   return "usable";
    case E820_RESERVED: return "reserved";
    case E820_ACPI:     return "ACPI reclaim";
    case E820_NVS:      return "ACPI NVS";
    case E820_BAD:      return "bad";
    default:            return "unknown";
    }
}

void pmm_init(const struct bootinfo *info)
{
    const struct e820_entry *map = (const struct e820_entry *)info->mmap_addr;
    uint64_t highest = 0;

    /* Pass 1: how much address space do we have to describe? */
    for (uint32_t i = 0; i < info->mmap_count; i++) {
        uint64_t end = map[i].base + map[i].length;
        if (map[i].type == E820_USABLE && end > highest)
            highest = end;
        total_bytes += (map[i].type == E820_USABLE) ? map[i].length : 0;
    }
    if (highest > MAX_PHYS)
        highest = MAX_PHYS;

    total_frames = (uint32_t)(highest >> PAGE_SHIFT);
    bitmap_words = (total_frames + 31) / 32;
    bitmap       = (uint32_t *)ALIGN_UP((uintptr_t)__kernel_end, 16);

    /* Pass 2: start with everything reserved, then hand back usable RAM. */
    memset(bitmap, 0xFF, bitmap_words * sizeof(uint32_t));
    used_frames = total_frames;

    for (uint32_t i = 0; i < info->mmap_count; i++) {
        if (map[i].type == E820_USABLE)
            mark_free((phys_addr_t)map[i].base, map[i].length);
    }

    /* Never hand out anything the kernel or the bitmap is sitting on. */
    {
        uintptr_t reserved_end = (uintptr_t)bitmap + bitmap_words * sizeof(uint32_t);
        mark_used(0, ALIGN_UP(reserved_end, PAGE_SIZE));
    }
}

phys_addr_t pmm_alloc_frame(void)
{
    uint32_t flags = irq_save();

    for (uint32_t w = 0; w < bitmap_words; w++) {
        if (bitmap[w] == 0xFFFFFFFFu)
            continue;
        for (uint32_t b = 0; b < 32; b++) {
            uint32_t frame = w * 32 + b;
            if (frame >= total_frames)
                break;
            if (!bit_test(frame)) {
                bit_set(frame);
                used_frames++;
                irq_restore(flags);
                return (phys_addr_t)frame << PAGE_SHIFT;
            }
        }
    }

    irq_restore(flags);
    return 0;                       /* out of physical memory */
}

void pmm_free_frame(phys_addr_t addr)
{
    uint32_t frame = addr >> PAGE_SHIFT;
    uint32_t flags;

    if (frame >= total_frames)
        return;

    flags = irq_save();
    if (bit_test(frame)) {
        bit_clear(frame);
        used_frames--;
    }
    irq_restore(flags);
}

uint32_t pmm_total_frames(void) { return total_frames; }
uint32_t pmm_used_frames(void)  { return used_frames; }
uint32_t pmm_free_frames(void)  { return total_frames - used_frames; }
uint64_t pmm_total_bytes(void)  { return total_bytes; }
