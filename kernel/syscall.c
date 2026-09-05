/*
 * System call dispatch.
 *
 * User programs trap in through int 0x80. Every pointer that crosses the
 * privilege boundary is checked against the calling process's address space.
 * Inputs require readable user pages; outputs require writable user pages.
 */
#include <kernel/types.h>
#include <kernel/version.h>
#include <kernel/console.h>
#include <kernel/kprintf.h>
#include <kernel/string.h>
#include <kernel/sched.h>
#include <kernel/mm.h>
#include <kernel/fs.h>
#include <kernel/proc.h>
#include <kernel/input.h>
#include <kernel/wm.h>
#include <kernel/gfx.h>
#include <kernel/sfs.h>
#include <kernel/rtc.h>
#include <kernel/blockdev.h>
#include <arch/x86.h>
#include <sys/syscall.h>
#include <sys/gui.h>
#include <sys/sysinfo.h>

/* Validate a user pointer that the kernel is about to write a structure to. */
#define USER_STRUCT(ptr, type) \
    (proc_user_write_ok((void *)(uintptr_t)(ptr), sizeof(type)) ? \
     (type *)(uintptr_t)(ptr) : NULL)

static int32_t sys_write(uint32_t fd, uint32_t buf, uint32_t len)
{
    if (fd != 1 && fd != 2)
        return -1;
    if (!proc_user_range_ok((const void *)(uintptr_t)buf, len))
        return -1;
    console_write((const char *)(uintptr_t)buf, len);
    return (int32_t)len;
}

static int32_t sys_read(uint32_t fd, uint32_t buf, uint32_t len)
{
    char *dst = (char *)(uintptr_t)buf;
    uint32_t i = 0;

    if (fd != 0 || !proc_user_write_ok(dst, len))
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
    char absolute[FS_PATH_MAX];

    if (proc_copy_user_string((const char *)(uintptr_t)path_ptr, path, sizeof(path)) < 0)
        return -1;
    if (!proc_user_range_ok((const void *)(uintptr_t)buf, len))
        return -1;
    if (vfs_abspath(proc_current()->cwd, path, absolute, sizeof(absolute)) < 0)
        return -1;
    return vfs_write_file(absolute, (const void *)(uintptr_t)buf, len) == 0 ?
           (int32_t)len : -1;
}

static int32_t sys_fs_read(uint32_t path_ptr, uint32_t buf, uint32_t len)
{
    char path[FS_PATH_MAX];
    char absolute[FS_PATH_MAX];

    if (proc_copy_user_string((const char *)(uintptr_t)path_ptr, path, sizeof(path)) < 0)
        return -1;
    if (!proc_user_write_ok((void *)(uintptr_t)buf, len))
        return -1;
    if (vfs_abspath(proc_current()->cwd, path, absolute, sizeof(absolute)) < 0)
        return -1;
    return (int32_t)vfs_read_file(absolute, (void *)(uintptr_t)buf, len);
}

static int32_t sys_spawn(uint32_t path_ptr, uint32_t argv_ptr, uint32_t argc)
{
    char path[FS_PATH_MAX];
    const char *argv[8];
    char storage[8][64];

    if (proc_copy_user_string((const char *)(uintptr_t)path_ptr, path, sizeof(path)) < 0)
        return -1;

    if (argc > ARRAY_SIZE(argv))
        argc = ARRAY_SIZE(argv);

    for (uint32_t i = 0; i < argc; i++) {
        const char *const *user_argv = (const char *const *)(uintptr_t)argv_ptr;
        const char *user_arg;

        if (!proc_user_range_ok(user_argv + i, sizeof(*user_argv)))
            return -1;
        user_arg = user_argv[i];
        if (proc_copy_user_string(user_arg, storage[i], sizeof(storage[i])) < 0)
            return -1;
        argv[i] = storage[i];
    }

    return proc_spawn(path, (int)argc, argv);
}

/* --------------------------------------------------------- filesystem */

static int32_t sys_opendir(uint32_t path_ptr, uint32_t out_ptr, uint32_t max)
{
    char path[FS_PATH_MAX];
    struct fs_node *node;
    struct sys_dirent *out = (struct sys_dirent *)(uintptr_t)out_ptr;
    size_t bytes;
    int count = 0;

    if (proc_copy_user_string((const char *)(uintptr_t)path_ptr, path, sizeof(path)) < 0)
        return -1;
    if (max > SIZE_MAX / sizeof(struct sys_dirent))
        return -1;
    bytes = (size_t)max * sizeof(struct sys_dirent);
    if (!proc_user_write_ok(out, bytes))
        return -1;

    node = vfs_lookup(proc_current()->cwd, path);
    if (!node || node->type != FS_DIR)
        return -1;

    for (struct fs_node *child = node->first_child;
         child && (uint32_t)count < max; child = child->next_sibling) {
        out[count].type = child->type;
        out[count].size = (uint32_t)child->size;
        strlcpy(out[count].name, child->name, SYS_NAME_MAX);
        count++;
    }
    return count;
}

static int32_t sys_stat(uint32_t path_ptr, uint32_t out_ptr)
{
    char path[FS_PATH_MAX];
    struct fs_node *node;
    struct sys_stat *out = USER_STRUCT(out_ptr, struct sys_stat);

    if (!out)
        return -1;
    if (proc_copy_user_string((const char *)(uintptr_t)path_ptr, path, sizeof(path)) < 0)
        return -1;

    node = vfs_lookup(proc_current()->cwd, path);
    if (!node)
        return -1;

    out->type = node->type;
    out->size = (uint32_t)node->size;
    out->readonly = node->readonly;
    return 0;
}

static int32_t sys_path_op(uint32_t path_ptr, int operation)
{
    char path[FS_PATH_MAX];
    struct process *proc = proc_current();

    if (!proc || proc_copy_user_string((const char *)(uintptr_t)path_ptr,
                                       path, sizeof(path)) < 0)
        return -1;

    switch (operation) {
    case SYS_UNLINK:
        return vfs_unlink(proc->cwd, path) == 0 ? 0 : -1;
    case SYS_MKDIR:
        return vfs_create(proc->cwd, path, FS_DIR) ? 0 : -1;
    case SYS_CHDIR: {
        char absolute[FS_PATH_MAX];
        struct fs_node *node;

        if (vfs_abspath(proc->cwd, path, absolute, sizeof(absolute)) < 0)
            return -1;
        node = vfs_lookup(NULL, absolute);
        if (!node || node->type != FS_DIR)
            return -1;
        strlcpy(proc->cwd, absolute, FS_PATH_MAX);
        return 0;
    }
    default:
        return -1;
    }
}

static int32_t sys_fs_append(uint32_t path_ptr, uint32_t buf, uint32_t len)
{
    char path[FS_PATH_MAX];
    char absolute[FS_PATH_MAX];

    if (proc_copy_user_string((const char *)(uintptr_t)path_ptr, path, sizeof(path)) < 0)
        return -1;
    if (!proc_user_range_ok((const void *)(uintptr_t)buf, len))
        return -1;
    if (vfs_abspath(proc_current()->cwd, path, absolute, sizeof(absolute)) < 0)
        return -1;
    return vfs_append_file(absolute, (const void *)(uintptr_t)buf, len) == 0 ?
           (int32_t)len : -1;
}

static int32_t sys_getcwd(uint32_t buf, uint32_t len)
{
    char *out = (char *)(uintptr_t)buf;

    if (len == 0 || !proc_user_write_ok(out, len))
        return -1;
    strlcpy(out, proc_current()->cwd, len);
    return 0;
}

/* ------------------------------------------------------- window system */

static int32_t sys_gui_create(uint32_t width, uint32_t height, uint32_t title_ptr)
{
    char title[GUI_MAX_TITLE];
    uint32_t flags = width >> 16;       /* flags travel in the top half */

    width &= 0xFFFF;

    if (proc_copy_user_string((const char *)(uintptr_t)title_ptr, title, sizeof(title)) < 0)
        strlcpy(title, "Window", sizeof(title));

    return wm_create_window(proc_current(), (int)width, (int)height, title, flags);
}

static int32_t sys_gui_info(uint32_t id, uint32_t out_ptr)
{
    struct gui_window_info *out = USER_STRUCT(out_ptr, struct gui_window_info);

    if (!out)
        return -1;
    return wm_window_info(proc_current(), id, out);
}

static int32_t sys_gui_poll(uint32_t id, uint32_t out_ptr)
{
    struct gui_event *out = USER_STRUCT(out_ptr, struct gui_event);

    if (!out)
        return -1;
    return wm_poll_event(proc_current(), id, out);
}

static int32_t sys_gui_wait(uint32_t id, uint32_t out_ptr, uint32_t timeout_ms)
{
    struct gui_event *out = USER_STRUCT(out_ptr, struct gui_event);
    uint64_t deadline = timer_ms() + timeout_ms;

    if (!out)
        return -1;

    for (;;) {
        int result = wm_poll_event(proc_current(), id, out);

        if (result != 0)
            return result;
        if (timeout_ms && timer_ms() >= deadline)
            return 0;
        thread_sleep_ms(8);
    }
}

static int32_t sys_gui_list(uint32_t out_ptr, uint32_t max)
{
    struct gui_window_desc *out = (struct gui_window_desc *)(uintptr_t)out_ptr;
    size_t bytes;

    if (max > GUI_MAX_WINDOWS)
        max = GUI_MAX_WINDOWS;
    if (max > SIZE_MAX / sizeof(struct gui_window_desc))
        return -1;
    bytes = (size_t)max * sizeof(struct gui_window_desc);
    if (!proc_user_write_ok(out, bytes))
        return -1;
    return wm_list_windows(out, (int)max);
}

static int32_t sys_gui_screen(uint32_t out_ptr)
{
    struct gui_screen_info *out = USER_STRUCT(out_ptr, struct gui_screen_info);

    if (!out)
        return -1;
    out->width = (uint32_t)gfx_width();
    out->height = (uint32_t)gfx_height();
    return 0;
}

/* --------------------------------------------------- system information */

static int32_t sys_sysinfo(uint32_t out_ptr)
{
    struct sys_info *out = USER_STRUCT(out_ptr, struct sys_info);
    size_t heap_used = 0, heap_total = 0;
    uint64_t disk_total = 0, disk_free = 0;
    char vendor[16];
    char brand[52];

    if (!out)
        return -1;

    kheap_stats(&heap_used, NULL, &heap_total, NULL);
    sfs_stats(&disk_total, &disk_free, NULL);
    cpu_identify(vendor, brand);

    out->uptime_ms = (uint32_t)timer_ms();
    out->total_memory_kb = (uint32_t)(((uint64_t)pmm_total_frames() * PAGE_SIZE) / KB);
    out->used_memory_kb = (uint32_t)(((uint64_t)pmm_used_frames() * PAGE_SIZE) / KB);
    out->heap_used_kb = (uint32_t)(heap_used / KB);
    out->heap_total_kb = (uint32_t)(heap_total / KB);
    out->processes = (uint32_t)proc_count();
    out->threads = (uint32_t)thread_count();
    out->screen_width = (uint32_t)gfx_width();
    out->screen_height = (uint32_t)gfx_height();
    out->disk_total_kb = (uint32_t)(disk_total / KB);
    out->disk_free_kb = (uint32_t)(disk_free / KB);
    strlcpy(out->cpu, brand[0] ? brand : vendor, sizeof(out->cpu));
    strlcpy(out->version, SIFAROS_VERSION, sizeof(out->version));
    return 0;
}

struct proclist_state {
    struct sys_proc *out;
    uint32_t         max;
    uint32_t         count;
};

static void collect_process(const struct process *proc, void *ctx)
{
    struct proclist_state *state = (struct proclist_state *)ctx;

    if (!state || !proc || state->count >= state->max)
        return;

    state->out[state->count].pid = (uint32_t)proc->pid;
    state->out[state->count].parent = (uint32_t)proc->parent;
    state->out[state->count].state = (uint32_t)proc->state;
    state->out[state->count].memory_kb = (proc->user_pages * PAGE_SIZE) / KB;
    state->out[state->count].cpu_ms = 0;
    strlcpy(state->out[state->count].name, proc->name, SYS_NAME_MAX);
    state->count++;
}

static int32_t sys_proclist(uint32_t out_ptr, uint32_t max)
{
    struct proclist_state state;
    size_t bytes;

    if (max > MAX_PROCESSES)
        max = MAX_PROCESSES;
    if (max > SIZE_MAX / sizeof(struct sys_proc))
        return -1;

    state.out = (struct sys_proc *)(uintptr_t)out_ptr;
    state.max = max;
    state.count = 0;
    bytes = (size_t)max * sizeof(struct sys_proc);

    if (!proc_user_write_ok(state.out, bytes))
        return -1;

    proc_foreach(collect_process, &state);
    return (int32_t)state.count;
}

static int32_t sys_time(uint32_t out_ptr)
{
    struct sys_time *out = USER_STRUCT(out_ptr, struct sys_time);
    struct rtc_time now;

    if (!out)
        return -1;

    rtc_read(&now);
    out->year = now.full_year;
    out->month = now.month;
    out->day = now.day;
    out->hour = now.hour;
    out->minute = now.minute;
    out->second = now.second;
    return 0;
}

static int32_t sys_log(uint32_t buf, uint32_t len)
{
    char *out = (char *)(uintptr_t)buf;

    if (!proc_user_write_ok(out, len))
        return -1;
    return (int32_t)console_log_read(out, len);
}

static void syscall_handler(struct registers *regs)
{
    uint32_t number = regs->eax;
    uint32_t arg1 = regs->ebx;
    uint32_t arg2 = regs->ecx;
    uint32_t arg3 = regs->edx;
    int32_t result = -1;

    switch (number) {
    case SYS_EXIT:
        proc_exit((int)arg1);
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
        result = proc_current()->pid;
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
    case SYS_SBRK:
        result = (int32_t)proc_sbrk((int32_t)arg1);
        break;
    case SYS_SPAWN:
        result = sys_spawn(arg1, arg2, arg3);
        break;
    case SYS_WAIT: {
        int code = 0;

        if (arg2) {                 /* non-blocking check */
            int finished = proc_try_wait((int)arg1, &code);

            result = (finished == 1) ? code : (finished == 0 ? -1000 : -1);
        } else {
            result = proc_wait((int)arg1, &code) == 0 ? code : -1;
        }
        break;
    }

    /* ---- filesystem ---- */
    case SYS_OPENDIR:
        result = sys_opendir(arg1, arg2, arg3);
        break;
    case SYS_STAT:
        result = sys_stat(arg1, arg2);
        break;
    case SYS_UNLINK:
    case SYS_MKDIR:
    case SYS_CHDIR:
        result = sys_path_op(arg1, (int)number);
        break;
    case SYS_FS_APPEND:
        result = sys_fs_append(arg1, arg2, arg3);
        break;
    case SYS_GETCWD:
        result = sys_getcwd(arg1, arg2);
        break;

    /* ---- window system ---- */
    case SYS_GUI_CREATE:
        result = sys_gui_create(arg1, arg2, arg3);
        break;
    case SYS_GUI_INFO:
        result = sys_gui_info(arg1, arg2);
        break;
    case SYS_GUI_INVALIDATE:
        result = wm_invalidate(proc_current(), arg1,
                               (int)(int16_t)(arg2 & 0xFFFF),
                               (int)(int16_t)(arg2 >> 16),
                               (int)(arg3 & 0xFFFF),
                               (int)(arg3 >> 16));
        break;
    case SYS_GUI_POLL:
        result = sys_gui_poll(arg1, arg2);
        break;
    case SYS_GUI_WAIT:
        result = sys_gui_wait(arg1, arg2, arg3);
        break;
    case SYS_GUI_DESTROY:
        result = wm_destroy_window(proc_current(), arg1);
        break;
    case SYS_GUI_TITLE: {
        char title[GUI_MAX_TITLE];

        if (proc_copy_user_string((const char *)(uintptr_t)arg2, title, sizeof(title)) < 0)
            result = -1;
        else
            result = wm_set_title(proc_current(), arg1, title);
        break;
    }
    case SYS_GUI_MOVE:
        result = wm_move_window(proc_current(), arg1, (int)arg2, (int)arg3);
        break;
    case SYS_GUI_RESIZE:
        result = wm_resize_window(proc_current(), arg1, (int)arg2, (int)arg3);
        break;
    case SYS_GUI_LIST:
        result = sys_gui_list(arg1, arg2);
        break;
    case SYS_GUI_ACTIVATE:
        result = wm_activate(arg1);
        break;
    case SYS_GUI_MINIMIZE:
        result = wm_minimize(arg1);
        break;
    case SYS_GUI_SCREEN:
        result = sys_gui_screen(arg1);
        break;
    case SYS_GUI_FLAGS:
        result = wm_set_flags(proc_current(), arg1, arg2);
        break;

    /* ---- system information ---- */
    case SYS_SYSINFO:
        result = sys_sysinfo(arg1);
        break;
    case SYS_PROCLIST:
        result = sys_proclist(arg1, arg2);
        break;
    case SYS_KILL:
        result = proc_kill((int)arg1);
        break;
    case SYS_LOG:
        result = sys_log(arg1, arg2);
        break;
    case SYS_TIME:
        result = sys_time(arg1);
        break;
    case SYS_REBOOT:
        cpu_reboot();
        break;
    case SYS_SHUTDOWN:
        cpu_halt();
        break;
    case SYS_FONT: {
        void *out = (void *)(uintptr_t)arg1;

        if (arg2 > 4096)
            arg2 = 4096;
        if (!proc_user_write_ok(out, arg2)) {
            result = -1;
            break;
        }
        memcpy(out, gfx_font(), arg2);
        result = (int32_t)arg2;
        break;
    }
    default:
        kprintf("syscall: unknown call %u from pid %d\n", number,
                proc_current()->pid);
        result = -1;
        break;
    }

    regs->eax = (uint32_t)result;
}

void syscall_init(void)
{
    isr_register(0x80, syscall_handler);
}
