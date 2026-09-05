#ifndef _KERNEL_MM_H
#define _KERNEL_MM_H

#include <kernel/types.h>
#include <kernel/bootinfo.h>

#define PAGE_SIZE  4096u
#define PAGE_SHIFT 12

/* ---- physical frame allocator ---- */
void        pmm_init(const struct bootinfo *info);
phys_addr_t pmm_alloc_frame(void);
void        pmm_free_frame(phys_addr_t frame);
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

void      paging_init(void);
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
