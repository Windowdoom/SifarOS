#ifndef _KERNEL_MM_H
#define _KERNEL_MM_H

#include <kernel/types.h>
#include <kernel/bootinfo.h>

#define PAGE_SIZE  4096u
#define PAGE_SHIFT 12

/* ---- physical frame allocator ---- */
void        pmm_init(const struct bootinfo *info);
phys_addr_t pmm_alloc_frame(void);
phys_addr_t pmm_alloc_frames(uint32_t count);   /* physically contiguous */
void        pmm_free_frame(phys_addr_t frame);
void        pmm_free_contiguous(phys_addr_t base, uint32_t count);
uint32_t    pmm_total_frames(void);
uint32_t    pmm_used_frames(void);
uint32_t    pmm_free_frames(void);
uint64_t    pmm_total_bytes(void);

/* ---- paging ----
 *
 * PTE_EXEC is a SifarOS mapping request bit, not a hardware bit. With PAE/NX
 * enabled, mappings are non-executable unless PTE_EXEC is explicitly present.
 * W+X mappings are rejected by the VMM.
 */
#define PTE_PRESENT  0x001u
#define PTE_WRITE    0x002u
#define PTE_USER     0x004u
#define PTE_ACCESSED 0x020u
#define PTE_DIRTY    0x040u
#define PTE_EXEC     0x200u

/*
 * Address spaces.
 *
 * SifarOS 2.0 uses 32-bit PAE paging: a four-entry PDPT points at four
 * 512-entry page directories, which in turn point at 512-entry 64-bit page
 * tables. The low 1 GiB kernel identity map is shared. The top 768 MiB kernel
 * region shares page tables, while the user slice in the first quarter of
 * PDPT slot 3 remains process-private.
 */
#define USER_MIN         0x40000000u
#define USER_MAX         0xD0000000u
#define KERNEL_HEAP_BASE 0xD0000000u
#define KERNEL_HEAP_MAX  0xD4000000u
#define KERNEL_FB_BASE   0xE0000000u

struct addr_space {
    uint64_t   *pdpt;             /* 4 entries; frame is 4 KiB aligned */
    phys_addr_t pdpt_phys;
    uint64_t   *pd[4];            /* one 4 KiB page directory per GiB */
    phys_addr_t pd_phys[4];
};

void      paging_init(void);
struct addr_space *vmm_kernel_space(void);
struct addr_space *vmm_current_space(void);
int       vmm_space_create(struct addr_space *space);
void      vmm_space_destroy(struct addr_space *space);
void      vmm_space_switch(struct addr_space *space);

int       vmm_map_in(struct addr_space *space, virt_addr_t virt, phys_addr_t phys, uint32_t flags);
void      vmm_unmap_in(struct addr_space *space, virt_addr_t virt);
phys_addr_t vmm_translate_in(struct addr_space *space, virt_addr_t virt);
/* Validate a complete virtual range, including user and optional write access. */
int       vmm_access_ok_in(struct addr_space *space, virt_addr_t start, size_t size, int write);
int       vmm_alloc_range(struct addr_space *space, virt_addr_t start, size_t size, uint32_t flags);
void      vmm_free_range(struct addr_space *space, virt_addr_t start, size_t size);

/* Shorthands that act on the kernel address space. */
int       vmm_map(virt_addr_t virt, phys_addr_t phys, uint32_t flags);
void      vmm_unmap(virt_addr_t virt);
phys_addr_t vmm_translate(virt_addr_t virt);
int       vmm_is_mapped(virt_addr_t virt);
uint32_t  vmm_mapped_pages(void);

/* ---- kernel heap ---- */
void   kheap_init(void);
void  *kmalloc(size_t size);
void  *kcalloc(size_t count, size_t size);
void  *krealloc(void *ptr, size_t size);
void   kfree(void *ptr);
void   kheap_stats(size_t *used, size_t *free, size_t *total, uint32_t *blocks);
int    kheap_check(void);

#endif
