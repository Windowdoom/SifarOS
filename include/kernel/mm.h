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

/* ---- paging ---- */
#define PTE_PRESENT 0x001
#define PTE_WRITE   0x002
#define PTE_USER    0x004
#define PTE_ACCESSED 0x020
#define PTE_DIRTY   0x040

/*
 * Address spaces.
 *
 * Every process gets its own page directory.  The kernel half (the identity
 * map, the heap window and the framebuffer) is described by page tables that
 * are allocated once at boot and shared into every directory, so a kernel
 * mapping made later is visible to every process without any bookkeeping.
 */
#define USER_MIN        0x40000000u
#define USER_MAX        0xD0000000u
#define KERNEL_HEAP_BASE 0xD0000000u
#define KERNEL_HEAP_MAX  0xD4000000u
#define KERNEL_FB_BASE   0xE0000000u

struct addr_space {
    uint32_t   *pd;             /* page directory, identity mapped */
    phys_addr_t pd_phys;
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
