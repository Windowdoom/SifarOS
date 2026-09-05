#ifndef _KERNEL_BOOTINFO_H
#define _KERNEL_BOOTINFO_H

#include <kernel/types.h>

#define BOOTINFO_MAGIC 0x53464F53u      /* "SFOS" */

/* Filled in by boot/stage2.asm before it jumps to the kernel. */
struct bootinfo {
    uint32_t magic;
    uint32_t mmap_count;
    uint32_t mmap_addr;
    uint32_t boot_drive;
    uint32_t kernel_lba;
    uint32_t kernel_sectors;

    /* Video mode chosen by stage 2 (fb_present is zero if VBE was refused). */
    uint32_t fb_addr;
    uint32_t fb_width;
    uint32_t fb_height;
    uint32_t fb_pitch;          /* bytes per scanline */
    uint32_t fb_bpp;
    uint32_t fb_present;

    uint32_t font_addr;         /* 4 KiB of 8x16 glyphs from the video BIOS */
} PACKED;

/* One int 15h/E820 descriptor. */
struct e820_entry {
    uint64_t base;
    uint64_t length;
    uint32_t type;          /* 1 = usable RAM */
    uint32_t acpi_flags;
} PACKED;

#define E820_USABLE   1
#define E820_RESERVED 2
#define E820_ACPI     3
#define E820_NVS      4
#define E820_BAD      5

const char *e820_type_name(uint32_t type);

#endif
