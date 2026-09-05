/*
 * ELF32 program loader.
 *
 * Static executables only. The loader treats the ELF file as untrusted input:
 * table arithmetic is bounds checked, load segments must stay in the user
 * window, writable+executable segments are rejected, load pages may not
 * overlap, and the entry point must land inside an executable segment.
 */
#include <kernel/elf.h>
#include <kernel/mm.h>
#include <kernel/string.h>
#include <kernel/kprintf.h>

#define MAX_PROGRAM_HEADERS 64

static int range_within(size_t offset, size_t length, size_t total)
{
    return offset <= total && length <= total - offset;
}

int elf_is_valid(const uint8_t *image, size_t size)
{
    const struct elf32_ehdr *header;
    size_t table_size;

    if (!image || size < sizeof(struct elf32_ehdr))
        return 0;

    header = (const struct elf32_ehdr *)image;
    if (header->magic != ELF_MAGIC)
        return 0;
    if (header->class != 1 || header->data != 1 || header->version != 1)
        return 0;
    if (header->type != 2 || header->machine != 3 || header->elf_version != 1)
        return 0;
    if (header->ehsize != sizeof(struct elf32_ehdr))
        return 0;
    if (header->phentsize != sizeof(struct elf32_phdr))
        return 0;
    if (header->phnum == 0 || header->phnum > MAX_PROGRAM_HEADERS)
        return 0;

    table_size = (size_t)header->phnum * sizeof(struct elf32_phdr);
    if (!range_within(header->phoff, table_size, size))
        return 0;

    return 1;
}

/*
 * Write into an address space we are not running in, one page at a time,
 * reaching each page through its low physical identity mapping.
 */
static int write_to_space(struct addr_space *space, virt_addr_t dst,
                          const void *src, size_t len)
{
    const uint8_t *bytes = (const uint8_t *)src;

    if (!space || (!src && len))
        return -1;

    while (len) {
        phys_addr_t phys = vmm_translate_in(space, dst);
        size_t offset = dst & (PAGE_SIZE - 1);
        size_t chunk = PAGE_SIZE - offset;

        if (!phys)
            return -1;
        if (chunk > len)
            chunk = len;

        memcpy((void *)(uintptr_t)phys, bytes, chunk);
        bytes += chunk;
        dst += (virt_addr_t)chunk;
        len -= chunk;
    }
    return 0;
}

static int load_pages_overlap(const struct elf32_ehdr *header,
                              const uint8_t *image, uint16_t current)
{
    const struct elf32_phdr *segment =
        (const struct elf32_phdr *)(image + header->phoff +
                                    (size_t)current * header->phentsize);
    virt_addr_t start = ALIGN_DOWN(segment->vaddr, PAGE_SIZE);
    virt_addr_t end = ALIGN_UP(segment->vaddr + segment->memsz, PAGE_SIZE);

    for (uint16_t j = 0; j < current; j++) {
        const struct elf32_phdr *other =
            (const struct elf32_phdr *)(image + header->phoff +
                                        (size_t)j * header->phentsize);
        virt_addr_t other_start;
        virt_addr_t other_end;

        if (other->type != PT_LOAD || other->memsz == 0)
            continue;
        other_start = ALIGN_DOWN(other->vaddr, PAGE_SIZE);
        other_end = ALIGN_UP(other->vaddr + other->memsz, PAGE_SIZE);
        if (start < other_end && other_start < end)
            return 1;
    }
    return 0;
}

int elf_load(struct addr_space *space, const uint8_t *image, size_t size,
             virt_addr_t *entry, virt_addr_t *break_start)
{
    const struct elf32_ehdr *header;
    virt_addr_t highest = 0;
    int entry_executable = 0;
    int load_segments = 0;

    if (!space || !elf_is_valid(image, size))
        return -1;

    header = (const struct elf32_ehdr *)image;

    for (uint16_t i = 0; i < header->phnum; i++) {
        const struct elf32_phdr *segment =
            (const struct elf32_phdr *)(image + header->phoff +
                                        (size_t)i * header->phentsize);
        uint32_t flags;
        uint32_t end;

        if (segment->type != PT_LOAD || segment->memsz == 0)
            continue;

        load_segments++;

        /* File bytes must be contained in both the input image and mem size. */
        if (segment->filesz > segment->memsz ||
            !range_within(segment->offset, segment->filesz, size))
            return -1;

        /* Reject address wraparound and all kernel/shared mappings. */
        if (segment->vaddr < USER_MIN || segment->vaddr >= USER_MAX ||
            segment->memsz > USER_MAX - segment->vaddr)
            return -1;
        end = segment->vaddr + segment->memsz;
        if (end <= segment->vaddr || end > USER_MAX)
            return -1;

        /* No load segment may request write and execute together. */
        if ((segment->flags & (PF_W | PF_X)) == (PF_W | PF_X))
            return -1;

        /* p_align is either 0/1 or a power of two, with ELF congruence. */
        if (segment->align &&
            (segment->align & (segment->align - 1)) != 0)
            return -1;
        if (segment->align > 1 &&
            ((segment->vaddr - segment->offset) & (segment->align - 1)) != 0)
            return -1;

        /* Page-level overlap can silently merge permissions. Refuse it. */
        if (load_pages_overlap(header, image, i))
            return -1;

        flags = PTE_PRESENT | PTE_USER;
        if (segment->flags & PF_W)
            flags |= PTE_WRITE;

        if (vmm_alloc_range(space, segment->vaddr, segment->memsz, flags) < 0)
            return -1;

        if (segment->filesz &&
            write_to_space(space, segment->vaddr, image + segment->offset,
                           segment->filesz) < 0)
            return -1;

        if (header->entry >= segment->vaddr && header->entry < end &&
            (segment->flags & PF_X))
            entry_executable = 1;

        /* vmm_alloc_range hands out zeroed frames, so .bss is already clear. */
        if (end > highest)
            highest = end;
    }

    if (!load_segments || !highest || !entry_executable)
        return -1;

    if (entry)
        *entry = header->entry;
    if (break_start)
        *break_start = ALIGN_UP(highest, PAGE_SIZE);
    return 0;
}
