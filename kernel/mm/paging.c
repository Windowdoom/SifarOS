/*
 * Paging and address spaces.
 *
 * Layout of the 4 GiB virtual address space:
 *
 *   0x00000000 - 0x3FFFFFFF   kernel: physical RAM, identity mapped
 *   0x40000000 - 0xCFFFFFFF   user: private to each process
 *   0xD0000000 - 0xD3FFFFFF   kernel heap window
 *   0xE0000000 - ...          framebuffer and other device mappings
 *
 * Kernel page tables are allocated once during boot and their directory
 * entries are copied into every process directory, so any mapping the kernel
 * makes later shows up in all of them. That is what lets an interrupt handler
 * run correctly no matter which process happens to be current.
 */
#include <kernel/mm.h>
#include <kernel/kprintf.h>
#include <kernel/string.h>
#include <arch/x86.h>
#include <kernel/io.h>

#define PDE_COUNT       1024
#define PTE_COUNT       1024
#define PDE_SPAN        (4u * MB)

#define KERNEL_PDE_LOW_END  (USER_MIN / PDE_SPAN)           /* 0..255 */
#define USER_PDE_START      (USER_MIN / PDE_SPAN)           /* 256 */
#define USER_PDE_END        (USER_MAX / PDE_SPAN)           /* 832 */

static struct addr_space kernel_space;
static struct addr_space *current_space;
static uint32_t mapped_pages;

static inline void invlpg(virt_addr_t virt)
{
    __asm__ volatile("invlpg (%0)" : : "r"(virt) : "memory");
}

static int is_kernel_pde(uint32_t index)
{
    return index < KERNEL_PDE_LOW_END || index >= USER_PDE_END;
}

static int user_page(virt_addr_t virt)
{
    return virt >= USER_MIN && virt < USER_MAX;
}

/* Fetch (or create) the page table backing one directory entry. */
static uint32_t *table_for(struct addr_space *space, virt_addr_t virt,
                           int create, uint32_t extra_flags)
{
    uint32_t index;
    uint32_t entry;

    if (!space || !space->pd)
        return NULL;

    index = virt >> 22;
    entry = space->pd[index];

    if (!(entry & PTE_PRESENT)) {
        phys_addr_t frame;

        if (!create)
            return NULL;
        frame = pmm_alloc_frame();
        if (!frame)
            return NULL;
        memset((void *)(uintptr_t)frame, 0, PAGE_SIZE);
        space->pd[index] = frame | PTE_PRESENT | PTE_WRITE | extra_flags;
        return (uint32_t *)(uintptr_t)frame;
    }

    if (extra_flags & PTE_USER)
        space->pd[index] |= PTE_USER;

    return (uint32_t *)(uintptr_t)(entry & ~0xFFFu);
}

int vmm_map_in(struct addr_space *space, virt_addr_t virt, phys_addr_t phys,
               uint32_t flags)
{
    uint32_t *table;
    uint32_t index;

    if (!space || !space->pd)
        return -1;
    if ((virt & (PAGE_SIZE - 1)) != 0 || (phys & (PAGE_SIZE - 1)) != 0)
        return -1;
    if ((flags & PTE_USER) && !user_page(virt))
        return -1;

    table = table_for(space, virt, 1, flags & PTE_USER);
    index = (virt >> 12) & 0x3FF;
    if (!table)
        return -1;

    if (!(table[index] & PTE_PRESENT))
        mapped_pages++;

    table[index] = phys | (flags & 0xFFFu) | PTE_PRESENT;
    if (space == current_space)
        invlpg(virt);
    return 0;
}

void vmm_unmap_in(struct addr_space *space, virt_addr_t virt)
{
    uint32_t *table;
    uint32_t index;

    if (!space || !space->pd)
        return;

    virt = ALIGN_DOWN(virt, PAGE_SIZE);
    table = table_for(space, virt, 0, 0);
    index = (virt >> 12) & 0x3FF;

    if (!table || !(table[index] & PTE_PRESENT))
        return;

    table[index] = 0;
    if (mapped_pages)
        mapped_pages--;
    if (space == current_space)
        invlpg(virt);
}

phys_addr_t vmm_translate_in(struct addr_space *space, virt_addr_t virt)
{
    uint32_t *table;
    uint32_t index;

    if (!space || !space->pd)
        return 0;

    table = table_for(space, virt, 0, 0);
    index = (virt >> 12) & 0x3FF;

    if (!table || !(table[index] & PTE_PRESENT))
        return 0;
    return (table[index] & ~0xFFFu) | (virt & 0xFFFu);
}

/*
 * Validate every page touched by a user range. Translation alone is not
 * enough: a kernel/shared page must never satisfy a user pointer check, and
 * output buffers must be writable before the kernel stores into them.
 */
int vmm_access_ok_in(struct addr_space *space, virt_addr_t start, size_t size,
                     int write)
{
    uint64_t end;
    virt_addr_t page;

    if (!space || !space->pd)
        return 0;
    if (size == 0)
        return 1;
    if (start < USER_MIN || start >= USER_MAX)
        return 0;

    end = (uint64_t)start + (uint64_t)size;
    if (end > USER_MAX || end <= start)
        return 0;

    page = ALIGN_DOWN(start, PAGE_SIZE);
    while ((uint64_t)page < end) {
        uint32_t pde = space->pd[page >> 22];
        uint32_t *table;
        uint32_t pte;

        if ((pde & (PTE_PRESENT | PTE_USER)) != (PTE_PRESENT | PTE_USER))
            return 0;

        table = (uint32_t *)(uintptr_t)(pde & ~0xFFFu);
        pte = table[(page >> 12) & 0x3FF];
        if ((pte & (PTE_PRESENT | PTE_USER)) != (PTE_PRESENT | PTE_USER))
            return 0;
        if (write && !(pte & PTE_WRITE))
            return 0;

        if (page > UINT32_MAX - PAGE_SIZE)
            return 0;
        page += PAGE_SIZE;
    }
    return 1;
}

/* Allocate fresh frames and map them over a virtual range. */
int vmm_alloc_range(struct addr_space *space, virt_addr_t start, size_t size,
                    uint32_t flags)
{
    uint64_t end64;
    virt_addr_t first;
    virt_addr_t last;
    virt_addr_t rollback_first = 0;
    int allocated_any = 0;

    if (!space || !space->pd)
        return -1;
    if (size == 0)
        return 0;

    end64 = (uint64_t)start + (uint64_t)size;
    if (end64 > UINT32_MAX || end64 <= start)
        return -1;
    if ((flags & PTE_USER) &&
        (start < USER_MIN || end64 > USER_MAX))
        return -1;

    first = ALIGN_DOWN(start, PAGE_SIZE);
    last = ALIGN_UP((virt_addr_t)end64, PAGE_SIZE);
    if (last < first)
        return -1;

    for (virt_addr_t page = first; page < last; page += PAGE_SIZE) {
        phys_addr_t frame;

        if (vmm_translate_in(space, page)) {
            /* Existing leading page is useful for sbrk extending a partial page. */
            if (allocated_any) {
                vmm_free_range(space, rollback_first, page - rollback_first);
                return -1;
            }
            continue;
        }

        frame = pmm_alloc_frame();
        if (!frame) {
            if (allocated_any)
                vmm_free_range(space, rollback_first, page - rollback_first);
            return -1;
        }
        memset((void *)(uintptr_t)frame, 0, PAGE_SIZE);

        if (vmm_map_in(space, page, frame, flags) < 0) {
            pmm_free_frame(frame);
            if (allocated_any)
                vmm_free_range(space, rollback_first, page - rollback_first);
            return -1;
        }

        if (!allocated_any) {
            rollback_first = page;
            allocated_any = 1;
        }
    }
    return 0;
}

void vmm_free_range(struct addr_space *space, virt_addr_t start, size_t size)
{
    uint64_t end64;
    virt_addr_t first;
    virt_addr_t last;

    if (!space || !space->pd || size == 0)
        return;

    end64 = (uint64_t)start + (uint64_t)size;
    if (end64 > UINT32_MAX || end64 <= start)
        return;

    first = ALIGN_DOWN(start, PAGE_SIZE);
    last = ALIGN_UP((virt_addr_t)end64, PAGE_SIZE);
    if (last < first)
        return;

    for (virt_addr_t page = first; page < last; page += PAGE_SIZE) {
        phys_addr_t phys = vmm_translate_in(space, page);

        if (phys) {
            vmm_unmap_in(space, page);
            pmm_free_frame(phys & ~0xFFFu);
        }
    }
}

/* ------------------------------------------------------------- spaces */

struct addr_space *vmm_kernel_space(void)  { return &kernel_space; }
struct addr_space *vmm_current_space(void) { return current_space; }

int vmm_space_create(struct addr_space *space)
{
    phys_addr_t frame;

    if (!space)
        return -1;

    frame = pmm_alloc_frame();
    if (!frame)
        return -1;

    space->pd = (uint32_t *)(uintptr_t)frame;
    space->pd_phys = frame;
    memset(space->pd, 0, PAGE_SIZE);

    /* Share every kernel directory entry, keep the user half empty. */
    for (uint32_t i = 0; i < PDE_COUNT; i++) {
        if (is_kernel_pde(i))
            space->pd[i] = kernel_space.pd[i];
    }
    return 0;
}

void vmm_space_destroy(struct addr_space *space)
{
    if (!space || !space->pd || space == &kernel_space)
        return;

    for (uint32_t i = USER_PDE_START; i < USER_PDE_END; i++) {
        uint32_t entry = space->pd[i];
        uint32_t *table;

        if (!(entry & PTE_PRESENT))
            continue;

        table = (uint32_t *)(uintptr_t)(entry & ~0xFFFu);
        for (uint32_t j = 0; j < PTE_COUNT; j++) {
            if (table[j] & PTE_PRESENT) {
                pmm_free_frame(table[j] & ~0xFFFu);
                if (mapped_pages)
                    mapped_pages--;
            }
        }
        pmm_free_frame(entry & ~0xFFFu);
        space->pd[i] = 0;
    }

    pmm_free_frame(space->pd_phys);
    space->pd = NULL;
    space->pd_phys = 0;
}

void vmm_space_switch(struct addr_space *space)
{
    if (!space || !space->pd || space == current_space)
        return;
    current_space = space;
    __asm__ volatile("movl %0, %%cr3" : : "r"(space->pd_phys) : "memory");
}

/* ------------------------------------------------- kernel space helpers */

int vmm_map(virt_addr_t virt, phys_addr_t phys, uint32_t flags)
{
    /* Kernel mappings go into the shared tables, so every process sees them. */
    return vmm_map_in(&kernel_space, virt, phys, flags & ~PTE_USER);
}

void vmm_unmap(virt_addr_t virt)
{
    vmm_unmap_in(&kernel_space, virt);
}

phys_addr_t vmm_translate(virt_addr_t virt)
{
    return vmm_translate_in(current_space ? current_space : &kernel_space, virt);
}

int vmm_is_mapped(virt_addr_t virt)
{
    return vmm_translate(virt) != 0;
}

uint32_t vmm_mapped_pages(void)
{
    return mapped_pages;
}

/* Pre-create the page tables for a kernel range so the directory entry for it
   never has to change again once processes start copying it. */
static void reserve_tables(virt_addr_t start, virt_addr_t end)
{
    for (virt_addr_t addr = start; addr < end; addr += PDE_SPAN) {
        if (!table_for(&kernel_space, addr, 1, 0))
            panic("paging: cannot reserve kernel page tables at %p", (void *)addr);
    }
}

void paging_init(void)
{
    phys_addr_t dir_frame = pmm_alloc_frame();
    uint64_t ram_end;

    if (!dir_frame)
        panic("paging: cannot allocate the kernel page directory");

    kernel_space.pd = (uint32_t *)(uintptr_t)dir_frame;
    kernel_space.pd_phys = dir_frame;
    memset(kernel_space.pd, 0, PAGE_SIZE);
    current_space = &kernel_space;

    ram_end = (uint64_t)pmm_total_frames() * PAGE_SIZE;
    if (ram_end > USER_MIN)
        ram_end = USER_MIN;

    for (uint64_t addr = 0; addr < ram_end; addr += PAGE_SIZE) {
        if (vmm_map_in(&kernel_space, (virt_addr_t)addr, (phys_addr_t)addr,
                       PTE_PRESENT | PTE_WRITE) < 0)
            panic("paging: identity map failed at %p", (void *)(uintptr_t)addr);
    }

    /* Heap and device windows get their tables now, contents later. */
    reserve_tables(KERNEL_HEAP_BASE, KERNEL_HEAP_MAX);
    reserve_tables(KERNEL_FB_BASE, KERNEL_FB_BASE + 64 * MB);

    __asm__ volatile("movl %0, %%cr3" : : "r"(kernel_space.pd_phys));
    __asm__ volatile(
        "movl %%cr0, %%eax\n"
        "orl  $0x80010000, %%eax\n"     /* PG | WP */
        "movl %%eax, %%cr0\n"
        : : : "eax");
}
