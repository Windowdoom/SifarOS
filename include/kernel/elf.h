#ifndef _KERNEL_ELF_H
#define _KERNEL_ELF_H

#include <kernel/types.h>
#include <kernel/mm.h>

#define ELF_MAGIC 0x464C457Fu       /* "\x7FELF" little endian */

struct elf32_ehdr {
    uint32_t magic;
    uint8_t  class;                 /* 1 = 32 bit */
    uint8_t  data;                  /* 1 = little endian */
    uint8_t  version;
    uint8_t  abi;
    uint8_t  pad[8];
    uint16_t type;                  /* 2 = executable */
    uint16_t machine;               /* 3 = x86 */
    uint32_t elf_version;
    uint32_t entry;
    uint32_t phoff;
    uint32_t shoff;
    uint32_t flags;
    uint16_t ehsize;
    uint16_t phentsize;
    uint16_t phnum;
    uint16_t shentsize;
    uint16_t shnum;
    uint16_t shstrndx;
} PACKED;

struct elf32_phdr {
    uint32_t type;                  /* 1 = PT_LOAD */
    uint32_t offset;
    uint32_t vaddr;
    uint32_t paddr;
    uint32_t filesz;
    uint32_t memsz;
    uint32_t flags;
    uint32_t align;
} PACKED;

#define PT_LOAD 1
#define PF_X    1
#define PF_W    2
#define PF_R    4

/*
 * Load an executable into a (not currently active) address space.  Segments
 * are written through the identity map, so the target space never has to be
 * the one we are running in.
 */
int elf_load(struct addr_space *space, const uint8_t *image, size_t size,
             virt_addr_t *entry, virt_addr_t *break_start);

int elf_is_valid(const uint8_t *image, size_t size);

#endif
