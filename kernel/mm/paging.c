/*
 * Paging.
 *
 * All physical RAM is identity mapped so the kernel can keep using physical
 * pointers (page tables included) after paging comes on.  Everything above
 * KERNEL_HEAP_BASE is free virtual space that the heap maps on demand, and
 * user programs get their own mappings marked with the user bit.
 */
#include <kernel/mm.h>
#include <kernel/kprintf.h>
#include <kernel/string.h>
#include <arch/x86.h>
#include <kernel/io.h>

#define ENTRIES_PER_TABLE 1024
#define IDENTITY_LIMIT    0xC0000000u   /* leave the top for heap/user space */

static uint32_t *page_directory;
static uint32_t  mapped_pages;

static uint32_t *table_for(virt_addr_t virt, int create, uint32_t extra_flags)
{
    uint32_t  dir_index = virt >> 22;
    uint32_t  entry = page_directory[dir_index];
    uint32_t *table;

    if (!(entry & PTE_PRESENT)) {
        phys_addr_t frame;

        if (!create)
            return NULL;
        frame = pmm_alloc_frame();
        if (!frame)
            return NULL;
        memset((void *)frame, 0, PAGE_SIZE);
        page_directory[dir_index] = frame | PTE_PRESENT | PTE_WRITE | extra_flags;
        return (uint32_t *)frame;
    }

    /* A user mapping needs the user bit on the directory entry too. */
    if (extra_flags & PTE_USER)
        page_directory[dir_index] |= PTE_USER;

    table = (uint32_t *)(entry & ~0xFFFu);
    return table;
}

static inline void invlpg(virt_addr_t virt)
{
    __asm__ volatile("invlpg (%0)" : : "r"(virt) : "memory");
}

int vmm_map(virt_addr_t virt, phys_addr_t phys, uint32_t flags)
{
    uint32_t *table = table_for(virt, 1, flags & PTE_USER);
    uint32_t  index = (virt >> 12) & 0x3FF;

    if (!table)
        return -1;

    if (!(table[index] & PTE_PRESENT))
        mapped_pages++;

    table[index] = (phys & ~0xFFFu) | (flags & 0xFFFu) | PTE_PRESENT;
    invlpg(virt);
    return 0;
}

void vmm_unmap(virt_addr_t virt)
{
    uint32_t *table = table_for(virt, 0, 0);
    uint32_t  index = (virt >> 12) & 0x3FF;

    if (!table || !(table[index] & PTE_PRESENT))
        return;

    table[index] = 0;
    mapped_pages--;
    invlpg(virt);
}

phys_addr_t vmm_translate(virt_addr_t virt)
{
    uint32_t *table = table_for(virt, 0, 0);
    uint32_t  index = (virt >> 12) & 0x3FF;

    if (!table || !(table[index] & PTE_PRESENT))
        return 0;
    return (table[index] & ~0xFFFu) | (virt & 0xFFFu);
}

int vmm_is_mapped(virt_addr_t virt)
{
    uint32_t *table = table_for(virt, 0, 0);
    uint32_t  index = (virt >> 12) & 0x3FF;

    return table && (table[index] & PTE_PRESENT);
}

uint32_t vmm_mapped_pages(void)
{
    return mapped_pages;
}

void paging_init(void)
{
    phys_addr_t dir_frame = pmm_alloc_frame();
    uint64_t    ram_end;

    if (!dir_frame)
        panic("paging: cannot allocate page directory");

    page_directory = (uint32_t *)dir_frame;
    memset(page_directory, 0, PAGE_SIZE);

    /* Identity map every frame of RAM we know about. */
    ram_end = (uint64_t)pmm_total_frames() * PAGE_SIZE;
    if (ram_end > IDENTITY_LIMIT)
        ram_end = IDENTITY_LIMIT;

    for (uint64_t addr = 0; addr < ram_end; addr += PAGE_SIZE) {
        if (vmm_map((virt_addr_t)addr, (phys_addr_t)addr, PTE_PRESENT | PTE_WRITE) < 0)
            panic("paging: identity map failed at %p", (void *)(uintptr_t)addr);
    }

    __asm__ volatile("movl %0, %%cr3" : : "r"(page_directory));
    __asm__ volatile(
        "movl %%cr0, %%eax\n"
        "orl  $0x80010000, %%eax\n"     /* PG | WP */
        "movl %%eax, %%cr0\n"
        : : : "eax");
}
