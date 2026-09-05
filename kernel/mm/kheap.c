/*
 * Kernel heap.
 *
 * A first-fit allocator over an implicit list of blocks.  The heap lives in
 * its own virtual region above the identity map and grows by asking the
 * physical allocator for frames and mapping them in, so heap growth is real
 * demand paging rather than a fixed static array.
 */
#include <kernel/mm.h>
#include <kernel/kprintf.h>
#include <kernel/string.h>
#include <kernel/io.h>

#define HEAP_BASE      0xD0000000u
#define HEAP_MAX_SIZE  (64u * MB)
#define BLOCK_MAGIC    0x48454150u      /* "HEAP" */
#define MIN_SPLIT      32u

struct block {
    uint32_t      magic;
    size_t        size;                 /* payload bytes */
    struct block *next;
    struct block *prev;
    uint32_t      free;
};

#define HEADER_SIZE (sizeof(struct block))

static struct block *first_block;
static virt_addr_t   heap_end;          /* first unmapped heap address */
static size_t        heap_bytes;

/* Map more pages at the end of the heap.  Returns 0 on success. */
static int grow(size_t bytes)
{
    size_t pages = (ALIGN_UP(bytes, PAGE_SIZE)) / PAGE_SIZE;

    if (heap_end + pages * PAGE_SIZE > HEAP_BASE + HEAP_MAX_SIZE)
        return -1;

    for (size_t i = 0; i < pages; i++) {
        phys_addr_t frame = pmm_alloc_frame();

        if (!frame)
            return -1;
        if (vmm_map(heap_end, frame, PTE_PRESENT | PTE_WRITE) < 0) {
            pmm_free_frame(frame);
            return -1;
        }
        heap_end += PAGE_SIZE;
        heap_bytes += PAGE_SIZE;
    }
    return 0;
}

void kheap_init(void)
{
    heap_end = HEAP_BASE;
    heap_bytes = 0;

    if (grow(64 * KB) < 0)
        panic("kheap: cannot map initial heap");

    first_block = (struct block *)HEAP_BASE;
    first_block->magic = BLOCK_MAGIC;
    first_block->size  = heap_bytes - HEADER_SIZE;
    first_block->next  = NULL;
    first_block->prev  = NULL;
    first_block->free  = 1;
}

/* Extend the heap and give the extra space to the last block. */
static int extend_heap(size_t needed)
{
    struct block *last = first_block;
    size_t        chunk = ALIGN_UP(needed + HEADER_SIZE, 64 * KB);
    virt_addr_t   old_end = heap_end;

    while (last->next)
        last = last->next;

    if (grow(chunk) < 0)
        return -1;

    if (last->free) {
        last->size += (heap_end - old_end);
    } else {
        struct block *fresh = (struct block *)old_end;

        fresh->magic = BLOCK_MAGIC;
        fresh->size  = (heap_end - old_end) - HEADER_SIZE;
        fresh->free  = 1;
        fresh->next  = NULL;
        fresh->prev  = last;
        last->next   = fresh;
    }
    return 0;
}

static void split(struct block *b, size_t size)
{
    struct block *rest;

    if (b->size < size + HEADER_SIZE + MIN_SPLIT)
        return;

    rest = (struct block *)((uint8_t *)b + HEADER_SIZE + size);
    rest->magic = BLOCK_MAGIC;
    rest->size  = b->size - size - HEADER_SIZE;
    rest->free  = 1;
    rest->next  = b->next;
    rest->prev  = b;
    if (b->next)
        b->next->prev = rest;
    b->next = rest;
    b->size = size;
}

void *kmalloc(size_t size)
{
    uint32_t      flags;
    struct block *b;

    if (size == 0)
        return NULL;
    size = ALIGN_UP(size, 8);

    flags = irq_save();

    for (int attempt = 0; attempt < 2; attempt++) {
        for (b = first_block; b; b = b->next) {
            if (b->free && b->size >= size) {
                split(b, size);
                b->free = 0;
                irq_restore(flags);
                return (uint8_t *)b + HEADER_SIZE;
            }
        }
        if (extend_heap(size) < 0)
            break;
    }

    irq_restore(flags);
    return NULL;
}

void *kcalloc(size_t count, size_t size)
{
    size_t total = count * size;
    void  *p = kmalloc(total);

    if (p)
        memset(p, 0, total);
    return p;
}

static void coalesce(struct block *b)
{
    if (b->next && b->next->free) {
        struct block *n = b->next;

        b->size += HEADER_SIZE + n->size;
        b->next = n->next;
        if (n->next)
            n->next->prev = b;
    }
    if (b->prev && b->prev->free) {
        struct block *p = b->prev;

        p->size += HEADER_SIZE + b->size;
        p->next = b->next;
        if (b->next)
            b->next->prev = p;
    }
}

void kfree(void *ptr)
{
    struct block *b;
    uint32_t      flags;

    if (!ptr)
        return;

    b = (struct block *)((uint8_t *)ptr - HEADER_SIZE);
    if (b->magic != BLOCK_MAGIC)
        panic("kfree: bad block header at %p", ptr);
    if (b->free)
        panic("kfree: double free at %p", ptr);

    flags = irq_save();
    b->free = 1;
    coalesce(b);
    irq_restore(flags);
}

void *krealloc(void *ptr, size_t size)
{
    struct block *b;
    void         *fresh;

    if (!ptr)
        return kmalloc(size);
    if (size == 0) {
        kfree(ptr);
        return NULL;
    }

    b = (struct block *)((uint8_t *)ptr - HEADER_SIZE);
    if (b->magic != BLOCK_MAGIC)
        panic("krealloc: bad block header at %p", ptr);
    if (b->size >= size)
        return ptr;

    fresh = kmalloc(size);
    if (!fresh)
        return NULL;
    memcpy(fresh, ptr, b->size);
    kfree(ptr);
    return fresh;
}

void kheap_stats(size_t *used, size_t *freed, size_t *total, uint32_t *blocks)
{
    size_t   u = 0, f = 0;
    uint32_t n = 0;
    uint32_t flags = irq_save();

    for (struct block *b = first_block; b; b = b->next) {
        if (b->free)
            f += b->size;
        else
            u += b->size;
        n++;
    }
    irq_restore(flags);

    if (used)   *used = u;
    if (freed)  *freed = f;
    if (total)  *total = heap_bytes;
    if (blocks) *blocks = n;
}

/* Walk the whole list looking for corruption.  Returns 0 when healthy. */
int kheap_check(void)
{
    uint32_t flags = irq_save();
    int      result = 0;

    for (struct block *b = first_block; b; b = b->next) {
        if (b->magic != BLOCK_MAGIC) {
            result = -1;
            break;
        }
        if (b->next && b->next->prev != b) {
            result = -2;
            break;
        }
        if ((virt_addr_t)b >= heap_end) {
            result = -3;
            break;
        }
    }
    irq_restore(flags);
    return result;
}
