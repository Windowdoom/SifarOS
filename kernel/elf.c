/*
 * ELF32 program loader.
 *
 * Only what a static executable needs: walk the program headers, map pages
 * for every PT_LOAD segment and copy the bytes in.  No dynamic linking, no
 * relocation, no interpreter.
 */
#include <kernel/elf.h>
#include <kernel/mm.h>
#include <kernel/string.h>
#include <kernel/kprintf.h>

int elf_is_valid(const uint8_t *image, size_t size)
{
    const struct elf32_ehdr *header = (const struct elf32_ehdr *)image;

    if (size < sizeof(*header))
        return 0;
    if (header->magic != ELF_MAGIC)
        return 0;
    if (header->class != 1 || header->data != 1)
        return 0;
    if (header->type != 2 || header->machine != 3)
        return 0;
    return 1;
}

/*
 * Write into an address space we are not running in, one page at a time,
 * reaching each page through its physical address.
 */
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

int elf_load(struct addr_space *space, const uint8_t *image, size_t size,
             virt_addr_t *entry, virt_addr_t *break_start)
{
    const struct elf32_ehdr *header = (const struct elf32_ehdr *)image;
    virt_addr_t highest = 0;

    if (!elf_is_valid(image, size))
        return -1;
    if (header->phoff + (uint32_t)header->phnum * header->phentsize > size)
        return -1;

    for (uint16_t i = 0; i < header->phnum; i++) {
        const struct elf32_phdr *segment =
            (const struct elf32_phdr *)(image + header->phoff + i * header->phentsize);
        uint32_t flags = PTE_PRESENT | PTE_USER | PTE_WRITE;

        if (segment->type != PT_LOAD || segment->memsz == 0)
            continue;

        /* Refuse anything that wants to live outside the user range. */
        if (segment->vaddr < USER_MIN ||
            segment->vaddr + segment->memsz > USER_MAX ||
            segment->offset + segment->filesz > size)
            return -1;

        if (vmm_alloc_range(space, segment->vaddr, segment->memsz, flags) < 0)
            return -1;

        if (segment->filesz &&
            write_to_space(space, segment->vaddr, image + segment->offset,
                           segment->filesz) < 0)
            return -1;

        /* vmm_alloc_range hands out zeroed frames, so .bss is already clear. */

        if (segment->vaddr + segment->memsz > highest)
            highest = segment->vaddr + segment->memsz;
    }

    if (!highest)
        return -1;

    if (entry)
        *entry = header->entry;
    if (break_start)
        *break_start = ALIGN_UP(highest, PAGE_SIZE);
    return 0;
}
