/*
 * System call dispatch.
 *
 * User programs trap in through int 0x80.  Every pointer that crosses the
 * boundary is validated first: it has to live inside the user address range
 * and every page it spans has to be mapped, or the call fails instead of
 * letting ring 3 talk the kernel into touching kernel memory.
 */
#include <kernel/types.h>
#include <kernel/console.h>
#include <kernel/kprintf.h>
#include <kernel/string.h>
#include <kernel/sched.h>
#include <kernel/mm.h>
#include <kernel/fs.h>
#include <arch/x86.h>
#include <sys/syscall.h>

#define USER_LIMIT (USER_STACK_TOP + PAGE_SIZE)

static int user_range_ok(uint32_t addr, uint32_t len)
{
    uint32_t page;

    if (len == 0)
        return 1;
    if (addr < USER_BASE || addr + len < addr || addr + len > USER_LIMIT)
        return 0;

    for (page = ALIGN_DOWN(addr, PAGE_SIZE); page < addr + len; page += PAGE_SIZE) {
        if (!vmm_is_mapped(page))
            return 0;
    }
    return 1;
}

/* Copy a NUL terminated string in from user space; returns length or -1. */
static int copy_user_string(uint32_t addr, char *out, size_t size)
{
    size_t i;

    for (i = 0; i < size - 1; i++) {
        if (!user_range_ok(addr + i, 1))
            return -1;
        out[i] = *(const char *)(uintptr_t)(addr + i);
        if (!out[i])
            return (int)i;
    }
    out[size - 1] = '\0';
    return -1;                      /* string was too long */
}

static int32_t sys_write(uint32_t fd, uint32_t buf, uint32_t len)
{
    if (fd != 1 && fd != 2)
        return -1;
    if (!user_range_ok(buf, len))
        return -1;
    console_write((const char *)(uintptr_t)buf, len);
    return (int32_t)len;
}

static int32_t sys_read(uint32_t fd, uint32_t buf, uint32_t len)
{
    char *dst = (char *)(uintptr_t)buf;
    uint32_t i = 0;

    if (fd != 0 || !user_range_ok(buf, len))
        return -1;

    while (i < len) {
        int c = console_getc();

        if (c < 0 || c > 0xFF)
            continue;
        if (c == '\r')
            c = '\n';
        console_putc((char)c);      /* echo, like a line discipline would */
        dst[i++] = (char)c;
        if (c == '\n')
            break;
    }
    return (int32_t)i;
}

static int32_t sys_fs_write(uint32_t path_ptr, uint32_t buf, uint32_t len)
{
    char path[FS_PATH_MAX];

    if (copy_user_string(path_ptr, path, sizeof(path)) < 0)
        return -1;
    if (!user_range_ok(buf, len))
        return -1;
    return vfs_write_file(path, (const void *)(uintptr_t)buf, len) == 0 ?
           (int32_t)len : -1;
}

static int32_t sys_fs_read(uint32_t path_ptr, uint32_t buf, uint32_t len)
{
    char path[FS_PATH_MAX];

    if (copy_user_string(path_ptr, path, sizeof(path)) < 0)
        return -1;
    if (!user_range_ok(buf, len))
        return -1;
    return (int32_t)vfs_read_file(path, (void *)(uintptr_t)buf, len);
}

static void syscall_handler(struct registers *regs)
{
    uint32_t number = regs->eax;
    uint32_t arg1 = regs->ebx;
    uint32_t arg2 = regs->ecx;
    uint32_t arg3 = regs->edx;
    int32_t  result = -1;

    switch (number) {
    case SYS_EXIT:
        thread_exit((int)arg1);
        break;                      /* not reached */
    case SYS_WRITE:
        result = sys_write(arg1, arg2, arg3);
        break;
    case SYS_READ:
        result = sys_read(arg1, arg2, arg3);
        break;
    case SYS_YIELD:
        sched_yield();
        result = 0;
        break;
    case SYS_SLEEP:
        thread_sleep_ms(arg1);
        result = 0;
        break;
    case SYS_GETPID:
        result = thread_current() ? thread_current()->tid : 0;
        break;
    case SYS_UPTIME:
        result = (int32_t)timer_ms();
        break;
    case SYS_FS_WRITE:
        result = sys_fs_write(arg1, arg2, arg3);
        break;
    case SYS_FS_READ:
        result = sys_fs_read(arg1, arg2, arg3);
        break;
    case SYS_PUTC:
        console_putc((char)arg1);
        result = 0;
        break;
    default:
        kprintf("syscall: unknown call %u from tid %d\n", number,
                thread_current() ? thread_current()->tid : -1);
        result = -1;
        break;
    }

    regs->eax = (uint32_t)result;
}

void syscall_init(void)
{
    isr_register(0x80, syscall_handler);
}
