/*
 * Physical memory manager: one bit per 4 KiB frame.
 *
 * The bitmap is parked immediately after the kernel image, and everything
 * below that (real mode IVT, BIOS data, the bootloader, the kernel itself)
 * stays permanently reserved. Everything the BIOS reported as usable RAM
 * inside the kernel's identity-mapped physical window becomes allocatable.
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

/*
 * Genesis directly dereferences physical frame addresses while building page
 * tables and copying between address spaces. Paging identity maps only the
 * low kernel window, ending at USER_MIN (1 GiB). Until a high-memory mapping
 * mechanism exists, never hand out a frame the kernel cannot directly reach.
 */
#define MAX_MANAGED_PHYS ((uint64_t)USER_MIN)

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
    uint64_t end = (uint64_t)base + length;
    uint32_t first;
    uint32_t last;

    if (end > MAX_MANAGED_PHYS)
        end = MAX_MANAGED_PHYS;
    if ((uint64_t)base >= end)
        return;

    first = base >> PAGE_SHIFT;
    last = (uint32_t)((end + PAGE_SIZE - 1) >> PAGE_SHIFT);

    for (uint32_t f = first; f < last && f < total_frames; f++) {
        if (!bit_test(f)) {
            bit_set(f);
            used_frames++;
        }
    }
}

static void mark_free(uint64_t base, uint64_t length)
{
    uint64_t end;
    uint32_t first;
    uint32_t last;

    if (base >= MAX_MANAGED_PHYS || length == 0)
        return;

    end = base + length;
    if (end < base || end > MAX_MANAGED_PHYS)
        end = MAX_MANAGED_PHYS;

    first = (uint32_t)((base + PAGE_SIZE - 1) >> PAGE_SHIFT);
    last = (uint32_t)(end >> PAGE_SHIFT);

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

    total_bytes = 0;

    /* Pass 1: describe only physical RAM that the kernel can identity-map. */
    for (uint32_t i = 0; i < info->mmap_count; i++) {
        uint64_t base;
        uint64_t end;
        uint64_t usable;

        if (map[i].type != E820_USABLE || map[i].length == 0)
            continue;

        base = map[i].base;
        if (base >= MAX_MANAGED_PHYS)
            continue;

        end = base + map[i].length;
        if (end < base || end > MAX_MANAGED_PHYS)
            end = MAX_MANAGED_PHYS;
        if (end <= base)
            continue;

        usable = end - base;
        total_bytes += usable;
        if (end > highest)
            highest = end;
    }

    total_frames = (uint32_t)(highest >> PAGE_SHIFT);
    bitmap_words = (total_frames + 31) / 32;
    bitmap = (uint32_t *)ALIGN_UP((uintptr_t)__kernel_end, 16);

    if (total_frames == 0 || bitmap_words == 0)
        panic("pmm: no usable low physical memory");

    /* Pass 2: start with everything reserved, then hand back usable RAM. */
    memset(bitmap, 0xFF, bitmap_words * sizeof(uint32_t));
    used_frames = total_frames;

    for (uint32_t i = 0; i < info->mmap_count; i++) {
        if (map[i].type == E820_USABLE)
            mark_free(map[i].base, map[i].length);
    }

    /* Never hand out anything the kernel or the bitmap is sitting on. */
    {
        uintptr_t reserved_end = (uintptr_t)bitmap + bitmap_words * sizeof(uint32_t);

        if ((uint64_t)reserved_end >= MAX_MANAGED_PHYS)
            panic("pmm: kernel metadata exceeds identity-mapped memory");
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

/*
 * Allocate a run of frames that are contiguous in physical memory. Window
 * buffers use this so the kernel can treat one as a flat array through the
 * identity map while the owning process sees it through its own mapping.
 */
phys_addr_t pmm_alloc_frames(uint32_t count)
{
    uint32_t flags;
    uint32_t run = 0;
    uint32_t start = 0;

    if (count == 0)
        return 0;
    if (count == 1)
        return pmm_alloc_frame();
    if (count > total_frames)
        return 0;

    flags = irq_save();
    for (uint32_t frame = 0; frame < total_frames; frame++) {
        if (bit_test(frame)) {
            run = 0;
            continue;
        }
        if (run == 0)
            start = frame;
        if (++run == count) {
            for (uint32_t i = 0; i < count; i++) {
                bit_set(start + i);
                used_frames++;
            }
            irq_restore(flags);
            return (phys_addr_t)start << PAGE_SHIFT;
        }
    }
    irq_restore(flags);
    return 0;
}

void pmm_free_contiguous(phys_addr_t base, uint32_t count)
{
    if ((base & (PAGE_SIZE - 1)) != 0)
        return;
    for (uint32_t i = 0; i < count; i++)
        pmm_free_frame(base + i * PAGE_SIZE);
}

void pmm_free_frame(phys_addr_t addr)
{
    uint32_t frame;
    uint32_t flags;

    if ((addr & (PAGE_SIZE - 1)) != 0)
        return;

    frame = addr >> PAGE_SHIFT;
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
