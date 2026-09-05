/*
 * ELF32 program loader.
 *
 * Static executables only. The loader treats the ELF file as untrusted input:
 * every table arithmetic operation is overflow checked, load segments must fit
 * inside the user address range, overlapping load pages are rejected, and W+X
 * segments are forbidden. PAE/NX then enforces those permissions in hardware.
 */
#include <kernel/elf.h>
#include <kernel/mm.h>
#include <kernel/string.h>
#include <kernel/kprintf.h>

static int range_within(size_t offset, size_t length, size_t total)
{
    return offset <= total && length <= total - offset;
}

int elf_is_valid(const uint8_t *image, size_t size)
{
    const struct elf32_ehdr *header;

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
    if (header->phnum == 0)
        return 0;
    if (!range_within(header->phoff,
                      (size_t)header->phnum * sizeof(struct elf32_phdr), size))
        return 0;
    return 1;
}

/* Write into an address space we are not running in, one page at a time,
 * reaching each page through its low-memory physical identity mapping. */
static int write_to_space(struct addr_space *space, virt_addr_t dst,
                          const void *src, size_t len)
{
    const uint8_t *bytes = (const uint8_t *)src;

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
        dst += chunk;
        len -= chunk;
    }
    return 0;
}

static int load_pages_overlap(const struct elf32_ehdr *header,
                              const struct elf32_phdr *segment, uint16_t before)
{
    uint64_t first_a = (uint64_t)ALIGN_DOWN(segment->vaddr, PAGE_SIZE);
    uint64_t last_a = ((uint64_t)segment->vaddr + segment->memsz + PAGE_SIZE - 1u) &
                      ~((uint64_t)PAGE_SIZE - 1u);

    for (uint16_t j = 0; j < before; j++) {
        const struct elf32_phdr *other =
            (const struct elf32_phdr *)((const uint8_t *)header + header->phoff +
                                        (size_t)j * header->phentsize);
        uint64_t first_b;
        uint64_t last_b;

        if (other->type != PT_LOAD || other->memsz == 0)
            continue;
        first_b = (uint64_t)ALIGN_DOWN(other->vaddr, PAGE_SIZE);
        last_b = ((uint64_t)other->vaddr + other->memsz + PAGE_SIZE - 1u) &
                 ~((uint64_t)PAGE_SIZE - 1u);
        if (first_a < last_b && first_b < last_a)
            return 1;
    }
    return 0;
}

int elf_load(struct addr_space *space, const uint8_t *image, size_t size,
             virt_addr_t *entry, virt_addr_t *break_start)
{
    const struct elf32_ehdr *header = (const struct elf32_ehdr *)image;
    virt_addr_t highest = 0;
    int entry_executable = 0;

    if (!space || !elf_is_valid(image, size))
        return -1;

    for (uint16_t i = 0; i < header->phnum; i++) {
        const struct elf32_phdr *segment =
            (const struct elf32_phdr *)(image + header->phoff +
                                        (size_t)i * header->phentsize);
        uint32_t flags;
        uint32_t end;

        if (segment->type != PT_LOAD || segment->memsz == 0)
            continue;

        if (segment->filesz > segment->memsz ||
            !range_within(segment->offset, segment->filesz, size))
            return -1;

        if (segment->vaddr < USER_MIN ||
            segment->memsz > USER_MAX - segment->vaddr)
            return -1;
        end = segment->vaddr + segment->memsz;
        if (end > USER_MAX)
            return -1;

        if ((segment->flags & (PF_W | PF_X)) == (PF_W | PF_X))
            return -1;
        if (load_pages_overlap(header, segment, i))
            return -1;

        flags = PTE_PRESENT | PTE_USER;
        if (segment->flags & PF_W)
            flags |= PTE_WRITE;
        if (segment->flags & PF_X)
            flags |= PTE_EXEC;

        if (segment->align &&
            (segment->align & (segment->align - 1)) != 0)
            return -1;
        if (segment->align > 1 &&
            ((segment->vaddr - segment->offset) & (segment->align - 1)) != 0)
            return -1;

        if (vmm_alloc_range(space, segment->vaddr, segment->memsz, flags) < 0)
            return -1;

        if (segment->filesz &&
            write_to_space(space, segment->vaddr, image + segment->offset,
                           segment->filesz) < 0)
            return -1;

        if (header->entry >= segment->vaddr && header->entry < end &&
            (segment->flags & PF_X))
            entry_executable = 1;

        if (end > highest)
            highest = end;
    }

    if (!highest || !entry_executable)
        return -1;

    if (entry)
        *entry = header->entry;
    if (break_start)
        *break_start = ALIGN_UP(highest, PAGE_SIZE);
    return 0;
}
