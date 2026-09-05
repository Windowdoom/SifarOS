/*
 * PAE paging and address spaces.
 *
 * Layout of the 4 GiB virtual address space:
 *
 *   0x00000000 - 0x3FFFFFFF   kernel: physical RAM, identity mapped
 *   0x40000000 - 0xCFFFFFFF   user: private to each process
 *   0xD0000000 - 0xD3FFFFFF   kernel heap window
 *   0xE0000000 - ...          framebuffer and other device mappings
 *
 * SifarOS 2.0 uses 32-bit PAE paging so every PTE has the hardware NX bit.
 * Mappings are non-executable by default and callers must explicitly request
 * PTE_EXEC. Writable+executable mappings are rejected.
 */
#include <kernel/mm.h>
#include <kernel/kprintf.h>
#include <kernel/string.h>
#include <arch/x86.h>
#include <kernel/io.h>

#define PDPT_COUNT       4u
#define PDE_COUNT        512u
#define PTE_COUNT        512u
#define PDE_SPAN         (2u * MB)
#define PAE_ADDR_MASK    0x000FFFFFFFFFF000ull
#define PAE_NX           (1ull << 63)

#define USER_PDPT_START  (USER_MIN >> 30)                    /* 1 */
#define USER_PDPT_LAST   ((USER_MAX - 1u) >> 30)             /* 3 */
#define USER_PD3_END     ((USER_MAX >> 21) & 0x1FFu)         /* 128 */

static struct addr_space kernel_space;
static struct addr_space *current_space;
static uint32_t mapped_pages;

extern uint8_t __text_start[];
extern uint8_t __text_end[];
extern uint8_t __rodata_start[];
extern uint8_t __rodata_end[];

static inline void invlpg(virt_addr_t virt)
{
    __asm__ volatile("invlpg (%0)" : : "r"(virt) : "memory");
}

/* PAE entries are 64 bit on a 32-bit CPU. Publish the high half first and the
 * low half containing PRESENT last, so an interrupt cannot observe a present
 * entry with stale high permission/address bits. Clearing does the reverse. */
static void entry_set(uint64_t *slot, uint64_t value)
{
    volatile uint32_t *parts = (volatile uint32_t *)slot;

    parts[1] = (uint32_t)(value >> 32);
    __asm__ volatile("" : : : "memory");
    parts[0] = (uint32_t)value;
}

static void entry_clear(uint64_t *slot)
{
    volatile uint32_t *parts = (volatile uint32_t *)slot;

    parts[0] = 0;
    __asm__ volatile("" : : : "memory");
    parts[1] = 0;
}

static phys_addr_t entry_phys(uint64_t entry)
{
    return (phys_addr_t)(entry & PAE_ADDR_MASK);
}

static uint32_t pdpt_index(virt_addr_t virt) { return virt >> 30; }
static uint32_t pd_index(virt_addr_t virt)   { return (virt >> 21) & 0x1FFu; }
static uint32_t pt_index(virt_addr_t virt)   { return (virt >> 12) & 0x1FFu; }

/* Fetch (or create) the page table backing one directory entry. */
static uint64_t *table_for(struct addr_space *space, virt_addr_t virt,
                           int create, uint32_t extra_flags)
{
    uint32_t pdi_slot;
    uint32_t pde_slot;
    uint64_t entry;

    if (!space || !space->pdpt)
        return NULL;

    pdi_slot = pdpt_index(virt);
    pde_slot = pd_index(virt);
    if (pdi_slot >= PDPT_COUNT || !space->pd[pdi_slot])
        return NULL;

    entry = space->pd[pdi_slot][pde_slot];
    if (!(entry & PTE_PRESENT)) {
        phys_addr_t frame;
        uint64_t pde_flags = PTE_PRESENT | PTE_WRITE;

        if (!create)
            return NULL;
        frame = pmm_alloc_frame();
        if (!frame)
            return NULL;
        memset((void *)(uintptr_t)frame, 0, PAGE_SIZE);
        if (extra_flags & PTE_USER)
            pde_flags |= PTE_USER;
        entry_set(&space->pd[pdi_slot][pde_slot],
                  ((uint64_t)frame & PAE_ADDR_MASK) | pde_flags);
        return (uint64_t *)(uintptr_t)frame;
    }

    if ((extra_flags & PTE_USER) && !(entry & PTE_USER)) {
        entry |= PTE_USER;
        entry_set(&space->pd[pdi_slot][pde_slot], entry);
    }

    return (uint64_t *)(uintptr_t)entry_phys(entry);
}

int vmm_map_in(struct addr_space *space, virt_addr_t virt, phys_addr_t phys, uint32_t flags)
{
    uint64_t *table;
    uint64_t entry;
    uint32_t index;

    if (!space || (virt & (PAGE_SIZE - 1u)) || (phys & (PAGE_SIZE - 1u)))
        return -1;

    /* Never allow a supervisor page inside the user window or a user page
     * outside it. This keeps accidental privilege inversions fail-closed. */
    if (virt >= USER_MIN && virt < USER_MAX) {
        if (!(flags & PTE_USER))
            return -1;
    } else if (flags & PTE_USER) {
        return -1;
    }

    if ((flags & PTE_WRITE) && (flags & PTE_EXEC))
        return -1;

    table = table_for(space, virt, 1, flags & PTE_USER);
    if (!table)
        return -1;

    index = pt_index(virt);
    if (!(table[index] & PTE_PRESENT))
        mapped_pages++;

    entry = ((uint64_t)phys & PAE_ADDR_MASK) | PTE_PRESENT;
    entry |= flags & (PTE_WRITE | PTE_USER);
    if (!(flags & PTE_EXEC))
        entry |= PAE_NX;

    entry_set(&table[index], entry);
    if (space == current_space)
        invlpg(virt);
    return 0;
}

void vmm_unmap_in(struct addr_space *space, virt_addr_t virt)
{
    uint64_t *table = table_for(space, virt, 0, 0);
    uint32_t index = pt_index(virt);

    if (!table || !(table[index] & PTE_PRESENT))
        return;

    entry_clear(&table[index]);
    if (mapped_pages)
        mapped_pages--;
    if (space == current_space)
        invlpg(virt);
}

phys_addr_t vmm_translate_in(struct addr_space *space, virt_addr_t virt)
{
    uint64_t *table = table_for(space, virt, 0, 0);
    uint32_t index = pt_index(virt);
    uint64_t entry;

    if (!table)
        return 0;
    entry = table[index];
    if (!(entry & PTE_PRESENT))
        return 0;
    return entry_phys(entry) | (virt & (PAGE_SIZE - 1u));
}

/* Allocate fresh frames and map them over a virtual range. Existing pages are
 * preserved. On allocation failure callers may destroy/retry the range; no
 * existing mapping is ever freed as part of rollback. */
int vmm_alloc_range(struct addr_space *space, virt_addr_t start, size_t size, uint32_t flags)
{
    uint64_t end;
    uint64_t first;
    uint64_t last;

    if (!space)
        return -1;
    if (size == 0)
        return 0;

    end = (uint64_t)start + (uint64_t)size;
    if (end > 0x100000000ull)
        return -1;
    first = (uint64_t)ALIGN_DOWN(start, PAGE_SIZE);
    last = (end + PAGE_SIZE - 1u) & ~((uint64_t)PAGE_SIZE - 1u);

    for (uint64_t page = first; page < last; page += PAGE_SIZE) {
        phys_addr_t frame;

        if (vmm_translate_in(space, (virt_addr_t)page))
            continue;

        frame = pmm_alloc_frame();
        if (!frame)
            return -1;
        memset((void *)(uintptr_t)frame, 0, PAGE_SIZE);
        if (vmm_map_in(space, (virt_addr_t)page, frame, flags) < 0) {
            pmm_free_frame(frame);
            return -1;
        }
    }
    return 0;
}

void vmm_free_range(struct addr_space *space, virt_addr_t start, size_t size)
{
    uint64_t end;
    uint64_t first;
    uint64_t last;

    if (!space || size == 0)
        return;
    end = (uint64_t)start + (uint64_t)size;
    if (end > 0x100000000ull)
        return;
    first = (uint64_t)ALIGN_DOWN(start, PAGE_SIZE);
    last = (end + PAGE_SIZE - 1u) & ~((uint64_t)PAGE_SIZE - 1u);

    for (uint64_t page = first; page < last; page += PAGE_SIZE) {
        phys_addr_t phys = vmm_translate_in(space, (virt_addr_t)page);

        if (phys) {
            vmm_unmap_in(space, (virt_addr_t)page);
            pmm_free_frame(phys & ~(PAGE_SIZE - 1u));
        }
    }
}

/* ------------------------------------------------------------- spaces */

struct addr_space *vmm_kernel_space(void)  { return &kernel_space; }
struct addr_space *vmm_current_space(void) { return current_space; }

static void free_space_tables(struct addr_space *space)
{
    if (!space)
        return;
    for (uint32_t i = 1; i < PDPT_COUNT; i++) {
        if (space->pd_phys[i])
            pmm_free_frame(space->pd_phys[i]);
        space->pd[i] = NULL;
        space->pd_phys[i] = 0;
    }
    if (space->pdpt_phys)
        pmm_free_frame(space->pdpt_phys);
    space->pdpt = NULL;
    space->pdpt_phys = 0;
}

int vmm_space_create(struct addr_space *space)
{
    phys_addr_t pdpt_frame;

    if (!space)
        return -1;
    memset(space, 0, sizeof(*space));

    pdpt_frame = pmm_alloc_frame();
    if (!pdpt_frame)
        return -1;
    space->pdpt = (uint64_t *)(uintptr_t)pdpt_frame;
    space->pdpt_phys = pdpt_frame;
    memset(space->pdpt, 0, PAGE_SIZE);

    /* Slot 0 is entirely kernel space and can share the kernel page directory. */
    space->pd[0] = kernel_space.pd[0];
    space->pd_phys[0] = kernel_space.pd_phys[0];
    entry_set(&space->pdpt[0], ((uint64_t)space->pd_phys[0] & PAE_ADDR_MASK) | PTE_PRESENT);

    /* Slots 1 and 2 are entirely private user address space. Slot 3 mixes
     * 256 MiB of user space with the kernel heap/device region, so it gets a
     * private page directory whose kernel PDEs point at the shared tables. */
    for (uint32_t i = 1; i < PDPT_COUNT; i++) {
        phys_addr_t frame = pmm_alloc_frame();

        if (!frame) {
            free_space_tables(space);
            return -1;
        }
        space->pd[i] = (uint64_t *)(uintptr_t)frame;
        space->pd_phys[i] = frame;
        memset(space->pd[i], 0, PAGE_SIZE);
        entry_set(&space->pdpt[i], ((uint64_t)frame & PAE_ADDR_MASK) | PTE_PRESENT);
    }

    for (uint32_t i = USER_PD3_END; i < PDE_COUNT; i++)
        space->pd[3][i] = kernel_space.pd[3][i];

    return 0;
}

void vmm_space_destroy(struct addr_space *space)
{
    if (!space || !space->pdpt || space == &kernel_space)
        return;

    for (uint32_t slot = USER_PDPT_START; slot <= USER_PDPT_LAST; slot++) {
        uint32_t end = (slot == USER_PDPT_LAST) ? USER_PD3_END : PDE_COUNT;

        if (!space->pd[slot])
            continue;

        for (uint32_t i = 0; i < end; i++) {
            uint64_t pde = space->pd[slot][i];
            uint64_t *table;

            if (!(pde & PTE_PRESENT))
                continue;

            table = (uint64_t *)(uintptr_t)entry_phys(pde);
            for (uint32_t j = 0; j < PTE_COUNT; j++) {
                if (table[j] & PTE_PRESENT) {
                    pmm_free_frame(entry_phys(table[j]));
                    if (mapped_pages)
                        mapped_pages--;
                }
            }
            pmm_free_frame(entry_phys(pde));
            entry_clear(&space->pd[slot][i]);
        }
    }

    free_space_tables(space);
    space->pd[0] = NULL;
    space->pd_phys[0] = 0;
}

void vmm_space_switch(struct addr_space *space)
{
    if (!space || !space->pdpt || space == current_space)
        return;
    current_space = space;
    __asm__ volatile("movl %0, %%cr3" : : "r"(space->pdpt_phys) : "memory");
}

/* ------------------------------------------------- kernel space helpers */

int vmm_map(virt_addr_t virt, phys_addr_t phys, uint32_t flags)
{
    return vmm_map_in(&kernel_space, virt, phys, flags);
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

/* Pre-create the page tables for a kernel range so the shared page-directory
 * entries never need to change after user address spaces start copying them. */
static void reserve_tables(virt_addr_t start, virt_addr_t end)
{
    for (virt_addr_t addr = start; addr < end; addr += PDE_SPAN) {
        if (!table_for(&kernel_space, addr, 1, 0))
            panic("paging: cannot reserve kernel page tables at %p", (void *)addr);
    }
}

static uint32_t identity_flags(virt_addr_t addr)
{
    virt_addr_t text_start = (virt_addr_t)(uintptr_t)__text_start;
    virt_addr_t text_end = (virt_addr_t)(uintptr_t)__text_end;
    virt_addr_t ro_start = (virt_addr_t)(uintptr_t)__rodata_start;
    virt_addr_t ro_end = (virt_addr_t)(uintptr_t)__rodata_end;

    if (addr >= text_start && addr < text_end)
        return PTE_PRESENT | PTE_EXEC;              /* RX */
    if (addr >= ro_start && addr < ro_end)
        return PTE_PRESENT;                         /* R + NX */
    return PTE_PRESENT | PTE_WRITE;                /* RW + NX */
}

void paging_init(void)
{
    phys_addr_t pdpt_frame;
    uint64_t ram_end;

    if (!cpu_has_pae() || !cpu_has_nx())
        panic("paging: SifarOS 2.0 requires x86 PAE and NX support");

    memset(&kernel_space, 0, sizeof(kernel_space));

    pdpt_frame = pmm_alloc_frame();
    if (!pdpt_frame)
        panic("paging: cannot allocate kernel PDPT");
    kernel_space.pdpt = (uint64_t *)(uintptr_t)pdpt_frame;
    kernel_space.pdpt_phys = pdpt_frame;
    memset(kernel_space.pdpt, 0, PAGE_SIZE);

    for (uint32_t i = 0; i < PDPT_COUNT; i++) {
        phys_addr_t frame = pmm_alloc_frame();

        if (!frame)
            panic("paging: cannot allocate page directory %u", i);
        kernel_space.pd[i] = (uint64_t *)(uintptr_t)frame;
        kernel_space.pd_phys[i] = frame;
        memset(kernel_space.pd[i], 0, PAGE_SIZE);
        entry_set(&kernel_space.pdpt[i], ((uint64_t)frame & PAE_ADDR_MASK) | PTE_PRESENT);
    }
    current_space = &kernel_space;

    ram_end = (uint64_t)pmm_total_frames() * PAGE_SIZE;
    if (ram_end > USER_MIN)
        ram_end = USER_MIN;

    for (uint64_t addr = 0; addr < ram_end; addr += PAGE_SIZE) {
        if (vmm_map_in(&kernel_space, (virt_addr_t)addr, (phys_addr_t)addr,
                       identity_flags((virt_addr_t)addr)) < 0)
            panic("paging: identity map failed at %p", (void *)(uintptr_t)addr);
    }

    /* Heap and device windows get their tables now, contents later. */
    reserve_tables(KERNEL_HEAP_BASE, KERNEL_HEAP_MAX);
    reserve_tables(KERNEL_FB_BASE, KERNEL_FB_BASE + 64 * MB);

    /* PAE must be enabled before CR3 points at the PDPT. NXE is set before
     * paging comes on so entries carrying bit 63 are never interpreted as
     * reserved-bit faults. */
    __asm__ volatile(
        "movl %%cr4, %%eax\n"
        "orl  $0x20, %%eax\n"       /* CR4.PAE */
        "movl %%eax, %%cr4\n"
        : : : "eax", "memory");

    if (cpu_enable_nx() < 0)
        panic("paging: failed to enable EFER.NXE");

    __asm__ volatile("movl %0, %%cr3" : : "r"(kernel_space.pdpt_phys) : "memory");
    __asm__ volatile(
        "movl %%cr0, %%eax\n"
        "orl  $0x80010000, %%eax\n"     /* PG | WP */
        "movl %%eax, %%cr0\n"
        : : : "eax", "memory");
}
