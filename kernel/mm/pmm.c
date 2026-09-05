/*
 * Physical memory manager: one bit per 4 KiB frame.
 *
 * The bitmap is parked immediately after the kernel image, and everything
 * below that (real mode IVT, BIOS data, the bootloader, the kernel itself)
 * stays permanently reserved.  Everything the BIOS reported as usable RAM
 * inside the kernel's direct map becomes allocatable.
 *
 * Important 32-bit invariant: kernel code currently dereferences physical
 * frame addresses directly, so every frame returned by this allocator must
 * also be identity mapped.  Until SifarOS grows a high-memory mapping window,
 * cap managed RAM at USER_MIN (1 GiB) rather than handing callers frames the
 * kernel cannot safely touch.
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

#define PMM_DIRECT_MAP_LIMIT ((uint64_t)USER_MIN)

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

static void mark_used(uint64_t base, uint64_t length)
{
    uint64_t first64;
    uint64_t last64;
    uint32_t first;
    uint32_t last;

    if (!length || base >= PMM_DIRECT_MAP_LIMIT)
        return;
    if (length > UINT64_MAX - base)
        length = UINT64_MAX - base;

    first64 = base >> PAGE_SHIFT;
    last64 = (base + length + PAGE_SIZE - 1) >> PAGE_SHIFT;
    if (first64 >= total_frames)
        return;
    if (last64 > total_frames)
        last64 = total_frames;

    first = (uint32_t)first64;
    last = (uint32_t)last64;
    for (uint32_t f = first; f < last; f++) {
        if (!bit_test(f)) {
            bit_set(f);
            used_frames++;
        }
    }
}

static void mark_free(uint64_t base, uint64_t length)
{
    uint64_t first64;
    uint64_t last64;
    uint32_t first;
    uint32_t last;

    if (!length || base >= PMM_DIRECT_MAP_LIMIT)
        return;
    if (length > UINT64_MAX - base)
        length = UINT64_MAX - base;

    first64 = (base + PAGE_SIZE - 1) >> PAGE_SHIFT;
    last64 = (base + length) >> PAGE_SHIFT;
    if (first64 >= total_frames)
        return;
    if (last64 > total_frames)
        last64 = total_frames;

    first = (uint32_t)first64;
    last = (uint32_t)last64;
    for (uint32_t f = first; f < last; f++) {
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

    /* Pass 1: record total reported usable RAM, but manage only the physical
       range that the kernel identity maps and can dereference directly. */
    for (uint32_t i = 0; i < info->mmap_count; i++) {
        uint64_t end;

        if (map[i].type != E820_USABLE)
            continue;
        if (map[i].length > UINT64_MAX - map[i].base)
            end = UINT64_MAX;
        else
            end = map[i].base + map[i].length;
        if (end > highest)
            highest = end;
        if (UINT64_MAX - total_bytes < map[i].length)
            total_bytes = UINT64_MAX;
        else
            total_bytes += map[i].length;
    }
    if (highest > PMM_DIRECT_MAP_LIMIT)
        highest = PMM_DIRECT_MAP_LIMIT;

    total_frames = (uint32_t)(highest >> PAGE_SHIFT);
    bitmap_words = (total_frames + 31) / 32;
    bitmap       = (uint32_t *)ALIGN_UP((uintptr_t)__kernel_end, 16);

    /* Pass 2: start with everything reserved, then hand back low usable RAM. */
    memset(bitmap, 0xFF, bitmap_words * sizeof(uint32_t));
    used_frames = total_frames;

    for (uint32_t i = 0; i < info->mmap_count; i++) {
        if (map[i].type == E820_USABLE)
            mark_free(map[i].base, map[i].length);
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
    return 0;                       /* out of managed physical memory */
}

/*
 * Allocate a run of frames that are contiguous in physical memory.  Window
 * buffers and DMA users rely on the returned range being both physically
 * contiguous and reachable through the kernel's identity map.
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
    if (count > total_frames || base >= USER_MIN)
        return;
    for (uint32_t i = 0; i < count; i++) {
        uint64_t addr = (uint64_t)base + (uint64_t)i * PAGE_SIZE;

        if (addr >= USER_MIN)
            break;
        pmm_free_frame((phys_addr_t)addr);
    }
}

void pmm_free_frame(phys_addr_t addr)
{
    uint32_t frame = addr >> PAGE_SHIFT;
    uint32_t flags;

    if (addr >= USER_MIN || frame >= total_frames)
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
