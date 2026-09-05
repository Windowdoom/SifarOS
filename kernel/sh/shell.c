/*
 * The SifarOS shell.
 *
 * Runs as an ordinary kernel thread and reads from the console, so it works
 * the same whether you are typing on the PS/2 keyboard or piping commands
 * down the serial line.
 */
#include <kernel/shell.h>
#include <kernel/version.h>
#include <kernel/console.h>
#include <kernel/kprintf.h>
#include <kernel/string.h>
#include <kernel/sched.h>
#include <kernel/mm.h>
#include <kernel/fs.h>
#include <kernel/proc.h>
#include <kernel/programs.h>
#include <kernel/rtc.h>
#include <kernel/ktest.h>
#include <kernel/gfx.h>
#include <kernel/sfs.h>
#include <kernel/blockdev.h>
#include <kernel/input.h>
#include <kernel/wm.h>
#include <kernel/io.h>
#include <arch/x86.h>

#define LINE_MAX     256
#define ARGS_MAX     16
#define HISTORY_MAX  16

static char cwd[FS_PATH_MAX] = "/";
static char history[HISTORY_MAX][LINE_MAX];
static int  history_count;

struct command {
    const char *name;
    const char *usage;
    const char *summary;
    int (*handler)(int argc, char **argv);
};

static const struct command *commands;
static int                   command_count;

/* ------------------------------------------------------------------ utils */

static void print_size(uint64_t bytes)
{
    if (bytes >= MB)
        kprintf("%u.%u MiB", (uint32_t)(bytes / MB),
                (uint32_t)(((bytes % MB) * 10) / MB));
    else if (bytes >= KB)
        kprintf("%u.%u KiB", (uint32_t)(bytes / KB),
                (uint32_t)(((bytes % KB) * 10) / KB));
    else
        kprintf("%u B", (uint32_t)bytes);
}

static int need_args(int argc, int wanted, const char *usage)
{
    if (argc < wanted) {
        kprintf("usage: %s\n", usage);
        return 0;
    }
    return 1;
}

/* --------------------------------------------------------------- commands */

static int cmd_help(int argc, char **argv)
{
    if (argc > 1) {
        for (int i = 0; i < command_count; i++) {
            if (strcmp(commands[i].name, argv[1]) == 0) {
                kprintf("%s\n  %s\n  usage: %s\n", commands[i].name,
                        commands[i].summary, commands[i].usage);
                return 0;
            }
        }
        kprintf("help: no such command: %s\n", argv[1]);
        return 1;
    }

    kprintf("SifarOS shell commands (help <name> for details):\n\n");
    for (int i = 0; i < command_count; i++)
        kprintf("  %-10s %s\n", commands[i].name, commands[i].summary);
    kprintf("\nline editing: arrows move and recall history, ^C cancels, ^L clears\n");
    return 0;
}

static int cmd_clear(int argc, char **argv)
{
    console_clear();
    return 0;
}

static int cmd_echo(int argc, char **argv)
{
    for (int i = 1; i < argc; i++)
        kprintf("%s%s", argv[i], (i + 1 < argc) ? " " : "");
    kprintf("\n");
    return 0;
}

static int cmd_uname(int argc, char **argv)
{
    char vendor[16];
    char brand[52];

    cpu_identify(vendor, brand);
    kprintf("%s %s i386\n", SIFAROS_NAME, SIFAROS_VERSION);
    kprintf("cpu: %s (%s)\n", brand[0] ? brand : "unknown", vendor);
    kprintf("built: " __DATE__ " " __TIME__ "\n");
    return 0;
}

static int cmd_uptime(int argc, char **argv)
{
    uint64_t ms = timer_ms();
    uint32_t seconds = (uint32_t)(ms / 1000);

    kprintf("up %u:%02u:%02u.%03u  (%u ticks at %u Hz)\n",
            seconds / 3600, (seconds / 60) % 60, seconds % 60,
            (uint32_t)(ms % 1000), (uint32_t)timer_ticks(), timer_hz());
    return 0;
}

static int cmd_date(int argc, char **argv)
{
    struct rtc_time now;

    rtc_read(&now);
    kprintf("%04u-%02u-%02u %02u:%02u:%02u UTC\n", now.full_year, now.month,
            now.day, now.hour, now.minute, now.second);
    return 0;
}

static int cmd_mem(int argc, char **argv)
{
    uint64_t total = (uint64_t)pmm_total_frames() * PAGE_SIZE;
    uint64_t used  = (uint64_t)pmm_used_frames() * PAGE_SIZE;

    kprintf("physical memory\n");
    kprintf("  total : ");  print_size(total); kprintf(" (%u frames)\n", pmm_total_frames());
    kprintf("  used  : ");  print_size(used);  kprintf(" (%u frames)\n", pmm_used_frames());
    kprintf("  free  : ");  print_size(total - used);
    kprintf(" (%u frames)\n", pmm_free_frames());
    kprintf("virtual memory\n");
    kprintf("  mapped: %u pages (", vmm_mapped_pages());
    print_size((uint64_t)vmm_mapped_pages() * PAGE_SIZE);
    kprintf(")\n");
    return 0;
}

static int cmd_heap(int argc, char **argv)
{
    size_t   used = 0, freed = 0, total = 0;
    uint32_t blocks = 0;
    int      health;

    kheap_stats(&used, &freed, &total, &blocks);
    health = kheap_check();

    kprintf("kernel heap\n");
    kprintf("  mapped: "); print_size(total); kprintf("\n");
    kprintf("  in use: "); print_size(used);  kprintf("\n");
    kprintf("  free  : "); print_size(freed); kprintf("\n");
    kprintf("  blocks: %u\n", blocks);
    kprintf("  check : %s\n", health == 0 ? "ok" : "CORRUPT");
    return health == 0 ? 0 : 1;
}

static void print_thread(const struct thread *t, void *ctx)
{
    uint32_t hz = timer_hz();

    (void)ctx;
    kprintf("  %-4d %-12s %-9s %8u ms  %s\n", t->tid, t->name,
            thread_state_name(t->state),
            (uint32_t)((t->cpu_ticks * 1000) / (hz ? hz : 1)),
            t->user ? "ring3" : "ring0");
}

static int cmd_ps(int argc, char **argv)
{
    kprintf("  %-4s %-12s %-9s %11s  %s\n", "TID", "NAME", "STATE", "CPU TIME", "MODE");
    sched_foreach(print_thread, NULL);
    kprintf("  %d thread(s)\n", thread_count());
    return 0;
}

static int cmd_kill(int argc, char **argv)
{
    if (!need_args(argc, 2, "kill <tid>"))
        return 1;
    if (thread_kill(atoi(argv[1])) < 0) {
        kprintf("kill: no such thread\n");
        return 1;
    }
    return 0;
}

static void worker_thread(void *arg)
{
    int id = (int)(uintptr_t)arg;

    for (int i = 1; i <= 3; i++) {
        kprintf("[worker %d] pass %d at %u ms\n", id, i, (uint32_t)timer_ms());
        thread_sleep_ms(150);
    }
    kprintf("[worker %d] done\n", id);
}

static int cmd_spawn(int argc, char **argv)
{
    int count = (argc > 1) ? atoi(argv[1]) : 2;

    if (count < 1 || count > 8) {
        kprintf("spawn: pick between 1 and 8 workers\n");
        return 1;
    }

    for (int i = 1; i <= count; i++) {
        char name[THREAD_NAME_MAX];
        int  tid;

        ksnprintf(name, sizeof(name), "worker%d", i);
        tid = thread_create(name, worker_thread, (void *)(uintptr_t)i);
        if (tid < 0) {
            kprintf("spawn: cannot create more threads\n");
            return 1;
        }
        kprintf("spawn: started %s as tid %d\n", name, tid);
    }
    return 0;
}

static int cmd_sleep(int argc, char **argv)
{
    if (!need_args(argc, 2, "sleep <milliseconds>"))
        return 1;
    thread_sleep_ms((uint32_t)atoi(argv[1]));
    return 0;
}

static int cmd_pwd(int argc, char **argv)
{
    kprintf("%s\n", cwd);
    return 0;
}

static int cmd_cd(int argc, char **argv)
{
    const char     *target = (argc > 1) ? argv[1] : "/";
    char            resolved[FS_PATH_MAX];
    struct fs_node *node;

    if (vfs_abspath(cwd, target, resolved, sizeof(resolved)) < 0) {
        kprintf("cd: path too long\n");
        return 1;
    }
    node = vfs_lookup(NULL, resolved);
    if (!node) {
        kprintf("cd: no such directory: %s\n", target);
        return 1;
    }
    if (node->type != FS_DIR) {
        kprintf("cd: not a directory: %s\n", target);
        return 1;
    }
    strlcpy(cwd, resolved, sizeof(cwd));
    return 0;
}

static int cmd_ls(int argc, char **argv)
{
    const char     *path = (argc > 1) ? argv[1] : ".";
    struct fs_node *node = vfs_lookup(cwd, path);
    int             entries = 0;

    if (!node) {
        kprintf("ls: no such file or directory: %s\n", path);
        return 1;
    }

    if (node->type == FS_FILE) {
        kprintf("%8u  %s\n", (uint32_t)node->size, node->name);
        return 0;
    }

    for (struct fs_node *c = node->first_child; c; c = c->next_sibling) {
        if (c->type == FS_DIR)
            kprintf("%8s  %s/\n", "<dir>", c->name);
        else
            kprintf("%8u  %s%s\n", (uint32_t)c->size, c->name,
                    c->readonly ? "  (read only)" : "");
        entries++;
    }
    if (entries == 0)
        kprintf("(empty)\n");
    return 0;
}

static void print_tree(struct fs_node *node, int depth)
{
    for (struct fs_node *c = node->first_child; c; c = c->next_sibling) {
        for (int i = 0; i < depth; i++)
            kprintf("  ");
        if (c->type == FS_DIR) {
            kprintf("%s/\n", c->name);
            print_tree(c, depth + 1);
        } else {
            kprintf("%s (%u bytes)\n", c->name, (uint32_t)c->size);
        }
    }
}

static int cmd_tree(int argc, char **argv)
{
    struct fs_node *node = vfs_lookup(cwd, (argc > 1) ? argv[1] : ".");

    if (!node) {
        kprintf("tree: no such directory\n");
        return 1;
    }
    kprintf("%s\n", (argc > 1) ? argv[1] : cwd);
    print_tree(node, 1);
    return 0;
}

static int cmd_cat(int argc, char **argv)
{
    char buffer[257];

    if (!need_args(argc, 2, "cat <file>"))
        return 1;

    for (int a = 1; a < argc; a++) {
        struct fs_node *node = vfs_lookup(cwd, argv[a]);
        size_t offset = 0;

        if (!node || node->type != FS_FILE) {
            kprintf("cat: not a file: %s\n", argv[a]);
            return 1;
        }
        while (offset < node->size) {
            ssize_t n = vfs_read(node, offset, buffer, sizeof(buffer) - 1);

            if (n <= 0)
                break;
            console_write(buffer, (size_t)n);
            offset += (size_t)n;
        }
        if (node->size && buffer[0] && offset > 0) {
            /* make sure the prompt starts on a fresh line */
            char last = 0;
            vfs_read(node, node->size - 1, &last, 1);
            if (last != '\n')
                kprintf("\n");
        }
    }
    return 0;
}

/* Join argv[from..] back into one string, space separated. */
static size_t join_args(int argc, char **argv, int from, char *out, size_t size)
{
    size_t len = 0;

    for (int i = from; i < argc; i++) {
        size_t piece = strlen(argv[i]);

        if (len + piece + 2 >= size)
            break;
        if (i > from)
            out[len++] = ' ';
        memcpy(out + len, argv[i], piece);
        len += piece;
    }
    out[len++] = '\n';
    out[len] = '\0';
    return len;
}

static int write_or_append(int argc, char **argv, int append)
{
    char            text[LINE_MAX];
    char            resolved[FS_PATH_MAX];
    struct fs_node *node;
    size_t          len;
    ssize_t         written;

    if (!need_args(argc, 3, append ? "append <file> <text...>" : "write <file> <text...>"))
        return 1;

    if (vfs_abspath(cwd, argv[1], resolved, sizeof(resolved)) < 0) {
        kprintf("write: path too long\n");
        return 1;
    }

    node = vfs_lookup(NULL, resolved);
    if (!node)
        node = vfs_create(NULL, resolved, FS_FILE);
    if (!node) {
        kprintf("write: cannot create %s\n", argv[1]);
        return 1;
    }
    if (node->type != FS_FILE) {
        kprintf("write: not a file: %s\n", argv[1]);
        return 1;
    }

    len = join_args(argc, argv, 2, text, sizeof(text));
    if (!append && vfs_truncate(node, 0) < 0) {
        kprintf("write: %s is read only\n", argv[1]);
        return 1;
    }

    written = vfs_write(node, append ? node->size : 0, text, len);
    if (written < 0) {
        kprintf("write: %s\n", written == -2 ? "read only file" : "write failed");
        return 1;
    }
    return 0;
}

static int cmd_write(int argc, char **argv)  { return write_or_append(argc, argv, 0); }
static int cmd_append(int argc, char **argv) { return write_or_append(argc, argv, 1); }

static int cmd_mkdir(int argc, char **argv)
{
    if (!need_args(argc, 2, "mkdir <directory>"))
        return 1;
    if (!vfs_create(cwd, argv[1], FS_DIR)) {
        kprintf("mkdir: cannot create %s\n", argv[1]);
        return 1;
    }
    return 0;
}

static int cmd_touch(int argc, char **argv)
{
    if (!need_args(argc, 2, "touch <file>"))
        return 1;
    if (vfs_lookup(cwd, argv[1]))
        return 0;
    if (!vfs_create(cwd, argv[1], FS_FILE)) {
        kprintf("touch: cannot create %s\n", argv[1]);
        return 1;
    }
    return 0;
}

static int cmd_rm(int argc, char **argv)
{
    if (!need_args(argc, 2, "rm <path>"))
        return 1;

    for (int i = 1; i < argc; i++) {
        int result = vfs_unlink(cwd, argv[i]);

        if (result == -2)
            kprintf("rm: %s is read only\n", argv[i]);
        else if (result < 0)
            kprintf("rm: cannot remove %s\n", argv[i]);
    }
    return 0;
}

static int cmd_cp(int argc, char **argv)
{
    struct fs_node *src, *dst;
    char            buffer[128];
    size_t          offset = 0;

    if (!need_args(argc, 3, "cp <source> <destination>"))
        return 1;

    src = vfs_lookup(cwd, argv[1]);
    if (!src || src->type != FS_FILE) {
        kprintf("cp: not a file: %s\n", argv[1]);
        return 1;
    }

    dst = vfs_lookup(cwd, argv[2]);
    if (!dst)
        dst = vfs_create(cwd, argv[2], FS_FILE);
    if (!dst || dst->type != FS_FILE) {
        kprintf("cp: cannot write %s\n", argv[2]);
        return 1;
    }
    if (vfs_truncate(dst, 0) < 0) {
        kprintf("cp: %s is read only\n", argv[2]);
        return 1;
    }

    while (offset < src->size) {
        ssize_t n = vfs_read(src, offset, buffer, sizeof(buffer));

        if (n <= 0)
            break;
        if (vfs_write(dst, offset, buffer, (size_t)n) < 0) {
            kprintf("cp: write failed\n");
            return 1;
        }
        offset += (size_t)n;
    }
    return 0;
}

static int cmd_stat(int argc, char **argv)
{
    struct fs_node *node;
    char            path[FS_PATH_MAX];

    if (!need_args(argc, 2, "stat <path>"))
        return 1;

    node = vfs_lookup(cwd, argv[1]);
    if (!node) {
        kprintf("stat: no such path: %s\n", argv[1]);
        return 1;
    }
    vfs_path_of(node, path, sizeof(path));

    kprintf("path     : %s\n", path[0] ? path : "/");
    kprintf("type     : %s\n", node->type == FS_DIR ? "directory" : "file");
    kprintf("size     : %u bytes\n", (uint32_t)node->size);
    kprintf("readonly : %s\n", node->readonly ? "yes" : "no");
    kprintf("created  : %u ms after boot\n", (uint32_t)node->created_ms);
    kprintf("modified : %u ms after boot\n", (uint32_t)node->modified_ms);
    return 0;
}

static int cmd_hexdump(int argc, char **argv)
{
    struct fs_node *node;
    uint8_t         buffer[16];
    size_t          offset = 0;

    if (!need_args(argc, 2, "hexdump <file>"))
        return 1;

    node = vfs_lookup(cwd, argv[1]);
    if (!node || node->type != FS_FILE) {
        kprintf("hexdump: not a file: %s\n", argv[1]);
        return 1;
    }

    while (offset < node->size) {
        ssize_t n = vfs_read(node, offset, buffer, sizeof(buffer));

        if (n <= 0)
            break;
        kprintf("%08x  ", (uint32_t)offset);
        for (int i = 0; i < 16; i++) {
            if (i < n)
                kprintf("%02x ", buffer[i]);
            else
                kprintf("   ");
        }
        kprintf(" |");
        for (int i = 0; i < n; i++)
            kprintf("%c", (buffer[i] >= 32 && buffer[i] < 127) ? buffer[i] : '.');
        kprintf("|\n");
        offset += (size_t)n;
    }
    return 0;
}

static int cmd_programs(int argc, char **argv)
{
    int count = 0;
    const struct embedded_program *list = program_list(&count);

    kprintf("user programs built into the kernel image:\n");
    for (int i = 0; i < count; i++)
        kprintf("  %-8s %5u bytes  %s\n", list[i].name,
                (uint32_t)(list[i].end - list[i].start), list[i].summary);
    kprintf("run one with: run <name>\n");
    return 0;
}

static int cmd_run(int argc, char **argv)
{
    const struct embedded_program *program;
    int pid, code = 0;

    if (!need_args(argc, 2, "run <program>"))
        return 1;

    program = program_find(argv[1]);
    if (!program) {
        kprintf("run: no such program: %s (try 'programs')\n", argv[1]);
        return 1;
    }
    {
        const char *args[4];
        int count = 0;

        args[count++] = program->name;
        for (int i = 2; i < argc && count < 4; i++)
            args[count++] = argv[i];

        pid = proc_spawn_image(program->name, program->start,
                               (size_t)(program->end - program->start),
                               count, args);
    }
    if (pid < 0) {
        kprintf("run: cannot start %s (error %d)\n", program->name, pid);
        return 1;
    }

    proc_wait(pid, &code);
    kprintf("[%s exited with status %d]\n", program->name, code);
    return 0;
}

/* Time the graphics paths, which decides how the compositor has to work. */
static int cmd_bench(int argc, char **argv)
{
    struct gfx_surface *screen;
    uint64_t start, elapsed;
    const int rounds = 30;

    if (!gfx_available()) {
        kprintf("bench: no framebuffer\n");
        return 1;
    }
    screen = gfx_screen();

    start = timer_ms();
    for (int i = 0; i < rounds; i++)
        gfx_clear(screen, RGB(0, 0, (uint32_t)(i * 8)));
    elapsed = timer_ms() - start;
    kprintf("back buffer clear : %u ms for %d frames (%u ms each)\n",
            (uint32_t)elapsed, rounds, (uint32_t)(elapsed / rounds));

    start = timer_ms();
    for (int i = 0; i < rounds; i++)
        gfx_present();
    elapsed = timer_ms() - start;
    kprintf("full present      : %u ms for %d frames (%u ms each)\n",
            (uint32_t)elapsed, rounds, (uint32_t)(elapsed / rounds));

    start = timer_ms();
    for (int i = 0; i < rounds; i++)
        gfx_present_rect(0, 0, 320, 240);
    elapsed = timer_ms() - start;
    kprintf("320x240 present   : %u ms for %d frames\n", (uint32_t)elapsed, rounds);

    start = timer_ms();
    for (int i = 0; i < rounds * 10; i++)
        gfx_fill_rect(screen, 100, 100, 400, 300, RGB(20, 30, 40));
    elapsed = timer_ms() - start;
    kprintf("400x300 fill x300 : %u ms\n", (uint32_t)elapsed);
    return 0;
}

static int cmd_df(int argc, char **argv)
{
    uint64_t total = 0, free_bytes = 0;
    uint32_t inodes = 0;

    if (!sfs_mounted()) {
        kprintf("filesystem: ramfs (in memory, nothing is written to disk)\n");
        kprintf("  nodes: %u, bytes: %u\n", vfs_node_count(),
                (uint32_t)vfs_bytes_used());
        return 0;
    }

    sfs_stats(&total, &free_bytes, &inodes);
    kprintf("filesystem: SifarFS \"%s\" on %s\n", sfs_label(), ata_model());
    kprintf("  size : ");  print_size(total); kprintf("\n");
    kprintf("  used : ");  print_size(total - free_bytes); kprintf("\n");
    kprintf("  free : ");  print_size(free_bytes); kprintf("\n");
    kprintf("  nodes: %u in the tree\n", vfs_node_count());
    return 0;
}

/* Load and run a program from the filesystem. */
static int cmd_exec(int argc, char **argv)
{
    const char *args[8];
    int count = 0;
    int pid, code = 0;

    if (!need_args(argc, 2, "exec <path> [arguments...]"))
        return 1;

    for (int i = 1; i < argc && count < 8; i++)
        args[count++] = argv[i];

    pid = proc_spawn(argv[1], count, args);
    if (pid < 0) {
        kprintf("exec: cannot start %s (error %d)\n", argv[1], pid);
        return 1;
    }

    proc_wait(pid, &code);
    kprintf("[%s exited with status %d]\n", argv[1], code);
    return 0;
}

static void print_process(const struct process *proc, void *ctx)
{
    (void)ctx;
    kprintf("  %-4d %-4d %-12s %-8s %5u KiB  %s\n", proc->pid, proc->parent,
            proc->name,
            proc->state == PROC_RUNNING ? "running" : "zombie",
            (proc->user_pages * PAGE_SIZE) / KB,
            proc->pid == 0 ? "kernel" : "user");
}

static int cmd_procs(int argc, char **argv)
{
    kprintf("  %-4s %-4s %-12s %-8s %9s  %s\n",
            "PID", "PPID", "NAME", "STATE", "MEMORY", "MODE");
    proc_foreach(print_process, NULL);
    kprintf("  %d process(es)\n", proc_count());
    return 0;
}

static int cmd_mouse(int argc, char **argv)
{
    uint32_t irqs = 0, packets = 0, buttons = 0;
    int x = 0, y = 0;

    int32_t dx = 0, dy = 0;
    uint32_t drops = 0;
    uint8_t raw[4] = { 0 };

    mouse_debug(&irqs, &packets, &x, &y, &buttons);
    mouse_debug_raw(&dx, &dy, &drops, raw);
    kprintf("mouse: %s, %u interrupts, %u packets, at (%d, %d), buttons 0x%x\n",
            mouse_present() ? "present" : "absent", irqs, packets, x, y, buttons);
    kprintf("       total movement (%d, %d), %u packets dropped, last bytes %02x %02x %02x %02x\n",
            dx, dy, drops, raw[0], raw[1], raw[2], raw[3]);
    return 0;
}

static int cmd_windows(int argc, char **argv)
{
    struct gui_window_desc list[GUI_MAX_WINDOWS];
    int count = wm_list_windows(list, GUI_MAX_WINDOWS);
    int x = 0, y = 0;
    uint32_t buttons = 0;

    mouse_position(&x, &y, &buttons);
    kprintf("cursor : (%d, %d), buttons 0x%x\n", x, y, buttons);
    kprintf("  %-4s %-4s %-8s %-8s %s\n", "ID", "PID", "STATE", "FOCUS", "TITLE");
    for (int i = 0; i < count; i++)
        kprintf("  %-4u %-4u %-8s %-8s %s\n", list[i].id, list[i].pid,
                list[i].state == GUI_STATE_MINIMIZED ? "min" : "normal",
                list[i].focused ? "yes" : "no", list[i].title);
    kprintf("  %d window(s)\n", count);
    return 0;
}

static int cmd_selftest(int argc, char **argv)
{
    return ktest_run();
}

static int cmd_history(int argc, char **argv)
{
    for (int i = 0; i < history_count; i++)
        kprintf("  %2d  %s\n", i + 1, history[i]);
    return 0;
}

static int cmd_reboot(int argc, char **argv)
{
    kprintf("rebooting...\n");
    timer_busy_wait(100);
    cpu_reboot();
    return 0;
}

static int cmd_halt(int argc, char **argv)
{
    kprintf("system halted, it is now safe to close the emulator\n");
    timer_busy_wait(100);
    cpu_halt();
    return 0;
}

static const struct command command_table[] = {
    { "help",     "help [command]",            "list commands or explain one", cmd_help },
    { "clear",    "clear",                     "clear the screen", cmd_clear },
    { "echo",     "echo <words...>",           "print the arguments", cmd_echo },
    { "uname",    "uname",                     "system and CPU identification", cmd_uname },
    { "uptime",   "uptime",                    "time since boot", cmd_uptime },
    { "date",     "date",                      "read the hardware clock", cmd_date },
    { "mem",      "mem",                       "physical and virtual memory usage", cmd_mem },
    { "heap",     "heap",                      "kernel heap usage and integrity", cmd_heap },
    { "ps",       "ps",                        "list threads", cmd_ps },
    { "kill",     "kill <tid>",                "stop a thread", cmd_kill },
    { "spawn",    "spawn [count]",             "start demo worker threads", cmd_spawn },
    { "sleep",    "sleep <ms>",                "block the shell for a while", cmd_sleep },
    { "ls",       "ls [path]",                 "list a directory", cmd_ls },
    { "tree",     "tree [path]",               "show the directory tree", cmd_tree },
    { "cd",       "cd [path]",                 "change directory", cmd_cd },
    { "pwd",      "pwd",                       "print the working directory", cmd_pwd },
    { "cat",      "cat <file...>",             "print file contents", cmd_cat },
    { "write",    "write <file> <text...>",    "replace a file with text", cmd_write },
    { "append",   "append <file> <text...>",   "add a line to a file", cmd_append },
    { "mkdir",    "mkdir <dir>",               "create a directory", cmd_mkdir },
    { "touch",    "touch <file>",              "create an empty file", cmd_touch },
    { "rm",       "rm <path...>",              "delete files or directories", cmd_rm },
    { "cp",       "cp <src> <dst>",            "copy a file", cmd_cp },
    { "stat",     "stat <path>",               "show file metadata", cmd_stat },
    { "hexdump",  "hexdump <file>",            "dump a file as hex", cmd_hexdump },
    { "programs", "programs",                  "list embedded user programs", cmd_programs },
    { "run",      "run <program>",             "run a program in ring 3", cmd_run },
    { "df",       "df",                        "filesystem usage", cmd_df },
    { "exec",     "exec <path> [args...]",     "run a program from the filesystem", cmd_exec },
    { "procs",    "procs",                     "list processes", cmd_procs },
    { "windows",  "windows",                   "list windows and the cursor", cmd_windows },
    { "mouse",    "mouse",                     "show mouse driver state", cmd_mouse },
    { "selftest", "selftest",                  "run the kernel self-test suite", cmd_selftest },
    { "bench",    "bench",                     "time the graphics paths", cmd_bench },
    { "history",  "history",                   "show recent commands", cmd_history },
    { "reboot",   "reboot",                    "restart the machine", cmd_reboot },
    { "halt",     "halt",                      "stop the machine", cmd_halt },
};

/* ------------------------------------------------------------- execution */

static int tokenize(char *line, char **argv, int max)
{
    int argc = 0;

    while (*line && argc < max) {
        char quote = 0;

        while (*line == ' ' || *line == '\t')
            line++;
        if (!*line)
            break;

        if (*line == '"' || *line == '\'') {
            quote = *line++;
        }
        argv[argc++] = line;

        if (quote) {
            while (*line && *line != quote)
                line++;
        } else {
            while (*line && *line != ' ' && *line != '\t')
                line++;
        }
        if (*line)
            *line++ = '\0';
    }
    return argc;
}

int shell_run_line(char *line)
{
    char *argv[ARGS_MAX];
    int   argc = tokenize(line, argv, ARGS_MAX);

    if (argc == 0)
        return 0;

    for (int i = 0; i < command_count; i++) {
        if (strcmp(commands[i].name, argv[0]) == 0)
            return commands[i].handler(argc, argv);
    }

    kprintf("%s: command not found (try 'help')\n", argv[0]);
    return 127;
}

/* ----------------------------------------------------------- line editor */

static void history_add(const char *line)
{
    if (!line[0])
        return;
    if (history_count && strcmp(history[history_count - 1], line) == 0)
        return;

    if (history_count == HISTORY_MAX) {
        for (int i = 1; i < HISTORY_MAX; i++)
            strlcpy(history[i - 1], history[i], LINE_MAX);
        history_count--;
    }
    strlcpy(history[history_count++], line, LINE_MAX);
}

static void erase_line(int length, int cursor)
{
    for (int i = cursor; i < length; i++)
        console_putc(' ');
    for (int i = 0; i < length; i++)
        console_putc('\b');
    for (int i = 0; i < length; i++)
        console_putc(' ');
    for (int i = 0; i < length; i++)
        console_putc('\b');
}

static void prompt(void)
{
    kprintf("sifar:%s$ ", cwd);
}

/* Read one line with editing.  Returns the length, or -1 if cancelled. */
static int read_line(char *buffer, int size)
{
    int length = 0;
    int cursor = 0;
    int browse = history_count;

    buffer[0] = '\0';

    for (;;) {
        int c = console_getc();

        if (c == '\n' || c == '\r') {
            console_putc('\n');
            buffer[length] = '\0';
            return length;
        }

        if (c == 3) {                       /* ^C */
            kprintf("^C\n");
            return -1;
        }

        if (c == 12) {                      /* ^L */
            console_clear();
            prompt();
            console_write(buffer, (size_t)length);
            for (int i = cursor; i < length; i++)
                console_putc('\b');
            continue;
        }

        if (c == '\b' || c == 127) {
            if (cursor > 0) {
                memmove(buffer + cursor - 1, buffer + cursor, (size_t)(length - cursor));
                cursor--;
                length--;
                console_putc('\b');
                console_write(buffer + cursor, (size_t)(length - cursor));
                console_putc(' ');
                for (int i = cursor; i <= length; i++)
                    console_putc('\b');
            }
            continue;
        }

        if (c == KEY_DELETE) {
            if (cursor < length) {
                memmove(buffer + cursor, buffer + cursor + 1, (size_t)(length - cursor - 1));
                length--;
                console_write(buffer + cursor, (size_t)(length - cursor));
                console_putc(' ');
                for (int i = cursor; i <= length; i++)
                    console_putc('\b');
            }
            continue;
        }

        if (c == KEY_LEFT) {
            if (cursor > 0) {
                cursor--;
                console_putc('\b');
            }
            continue;
        }

        if (c == KEY_RIGHT) {
            if (cursor < length)
                console_putc(buffer[cursor++]);
            continue;
        }

        if (c == KEY_HOME) {
            while (cursor > 0) {
                cursor--;
                console_putc('\b');
            }
            continue;
        }

        if (c == KEY_END) {
            while (cursor < length)
                console_putc(buffer[cursor++]);
            continue;
        }

        if (c == KEY_UP || c == KEY_DOWN) {
            int target = browse + ((c == KEY_UP) ? -1 : 1);

            if (target < 0 || target > history_count)
                continue;
            erase_line(length, cursor);
            browse = target;
            if (browse == history_count) {
                length = cursor = 0;
                buffer[0] = '\0';
            } else {
                strlcpy(buffer, history[browse], (size_t)size);
                length = cursor = (int)strlen(buffer);
                console_write(buffer, (size_t)length);
            }
            continue;
        }

        if (c < 32 || c > 126)
            continue;
        if (length + 1 >= size)
            continue;

        memmove(buffer + cursor + 1, buffer + cursor, (size_t)(length - cursor));
        buffer[cursor] = (char)c;
        length++;
        console_write(buffer + cursor, (size_t)(length - cursor));
        cursor++;
        for (int i = cursor; i < length; i++)
            console_putc('\b');
    }
}

void shell_thread(void *arg)
{
    char line[LINE_MAX];

    commands = command_table;
    command_count = (int)ARRAY_SIZE(command_table);

    kprintf("\nSifarOS shell. Type 'help' for the command list.\n\n");

    for (;;) {
        int length;

        prompt();
        length = read_line(line, sizeof(line));
        if (length < 0)
            continue;
        if (length == 0)
            continue;

        history_add(line);
        shell_run_line(line);
    }
}
