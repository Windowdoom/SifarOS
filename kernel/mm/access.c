/*
 * User virtual-memory access validation.
 *
 * Syscalls use this before dereferencing ring-3 pointers.  A range is valid
 * only when every covered page belongs to user space and is mapped with the
 * permissions required by the operation.
 */
#include <kernel/mm.h>

int vmm_access_ok_in(struct addr_space *space, virt_addr_t start,
                     size_t size, int write)
{
    virt_addr_t end;
    virt_addr_t page;

    if (!space || !space->pd)
        return 0;

    /* POSIX-style zero-length buffers do not require a dereference. */
    if (size == 0)
        return 1;

    if (start < USER_MIN || start >= USER_MAX)
        return 0;

    /* Avoid start + size overflow and crossing out of the user window. */
    if (size > (size_t)(USER_MAX - start))
        return 0;

    end = start + (virt_addr_t)size - 1u;
    page = start & ~(PAGE_SIZE - 1u);

    for (;;) {
        uint32_t pde = space->pd[page >> 22];
        uint32_t *table;
        uint32_t pte;

        if (!(pde & PTE_PRESENT) || !(pde & PTE_USER))
            return 0;

        table = (uint32_t *)(uintptr_t)(pde & ~0xFFFu);
        pte = table[(page >> PAGE_SHIFT) & 0x3FFu];

        if (!(pte & PTE_PRESENT) || !(pte & PTE_USER))
            return 0;
        if (write && !(pte & PTE_WRITE))
            return 0;

        if (page >= (end & ~(PAGE_SIZE - 1u)))
            break;
        if (page > 0xFFFFFFFFu - PAGE_SIZE)
            return 0;
        page += PAGE_SIZE;
    }

    return 1;
}
