/*
 * SifarOS kernel entry.
 *
 * Everything below runs in 32-bit protected mode on the stack set up by
 * arch/x86/entry.S.  Bring-up order matters: console first so failures are
 * visible, then descriptor tables, then memory, then the scheduler.
 */
#include <kernel/types.h>
#include <kernel/version.h>
#include <kernel/bootinfo.h>
#include <kernel/console.h>
#include <kernel/kprintf.h>
#include <kernel/string.h>
#include <kernel/mm.h>
#include <kernel/sched.h>
#include <kernel/io.h>
#include <kernel/fs.h>
#include <kernel/proc.h>
#include <kernel/programs.h>
#include <kernel/shell.h>
#include <arch/x86.h>
#include <kernel/gfx.h>
#include <kernel/input.h>
#include <kernel/blockdev.h>
#include <kernel/sfs.h>
#include <kernel/wm.h>


static struct bootinfo boot_copy;

static void banner(void)
{
    char vendor[16];
    char brand[52];

    vga_set_color(VGA_LIGHT_CYAN, VGA_BLACK);
    kprintf("\n");
    kprintf("  ____  _  __            ___  ____\n");
    kprintf(" / ___|(_)/ _| __ _ _ __  / _ \\/ ___|\n");
    kprintf(" \\___ \\| | |_ / _` | '__|| | | \\___ \\\n");
    kprintf("  ___) | |  _| (_| | |   | |_| |___) |\n");
    kprintf(" |____/|_|_|  \\__,_|_|    \\___/|____/\n");
    vga_set_color(VGA_LIGHT_GREY, VGA_BLACK);
    kprintf("\n%s %s - an operating system built from scratch\n\n",
            SIFAROS_NAME, SIFAROS_VERSION);

    cpu_identify(vendor, brand);
    kprintf("cpu    : %s (%s)\n", brand[0] ? brand : "unknown", vendor);
}

static void report_memory(const struct bootinfo *info)
{
    const struct e820_entry *map = (const struct e820_entry *)info->mmap_addr;
    uint64_t usable = 0;

    kprintf("memory : BIOS reported %u region%s\n", info->mmap_count,
            info->mmap_count == 1 ? "" : "s");

    for (uint32_t i = 0; i < info->mmap_count; i++) {
        if (map[i].type == E820_USABLE)
            usable += map[i].length;
    }

    kprintf("         %u MiB usable, %u MiB managed in direct map (%u frames)\n",
            (uint32_t)(usable / MB),
            (uint32_t)(((uint64_t)pmm_total_frames() * PAGE_SIZE) / MB),
            pmm_total_frames());
}

/* Give the fresh filesystem something to look at. */
static void seed_filesystem(void)
{
    static const char motd[] =
        "Welcome to SifarOS.\n"
        "\n"
        "Everything here was written from scratch: the boot sector, the loader,\n"
        "the kernel, the drivers and this filesystem, which lives entirely in RAM\n"
        "and starts over on every boot.\n"
        "\n"
        "Type 'help' to see what the shell can do, 'selftest' to run the kernel\n"
        "test suite, or 'run hello' to execute a program in ring 3.\n";

    static const char release[] = "SifarOS " SIFAROS_VERSION " (i386)\n";

    static const char readme[] =
        "SifarOS\n"
        "=======\n"
        "\n"
        "A 32-bit operating system for x86: two-stage bootloader, protected mode\n"
        "kernel, paging, preemptive scheduling, an in-memory filesystem and\n"
        "ring 3 user programs reached through int 0x80.\n";

    vfs_create(NULL, "/etc", FS_DIR);
    vfs_create(NULL, "/home", FS_DIR);
    vfs_create(NULL, "/tmp", FS_DIR);
    vfs_create(NULL, "/bin", FS_DIR);

    vfs_write_file("/etc/motd", motd, sizeof(motd) - 1);
    vfs_write_file("/etc/release", release, sizeof(release) - 1);
    vfs_write_file("/README.md", readme, sizeof(readme) - 1);

    /* The system files are not the shell's to delete. */
    {
        struct fs_node *node;

        if ((node = vfs_lookup(NULL, "/etc/motd")))
            node->readonly = 1;
        if ((node = vfs_lookup(NULL, "/etc/release")))
            node->readonly = 1;
    }

    /* /bin lists what 'run' can start, so the tree reflects reality. */
    {
        int count = 0;
        const struct embedded_program *list = program_list(&count);

        for (int i = 0; i < count; i++) {
            char path[FS_PATH_MAX];
            char description[128];
            int  len;

            ksnprintf(path, sizeof(path), "/bin/%s", list[i].name);
            len = ksnprintf(description, sizeof(description),
                            "%s: %s (%u bytes of ring 3 code)\n",
                            list[i].name, list[i].summary,
                            (uint32_t)(list[i].end - list[i].start));
            vfs_write_file(path, description, (size_t)len);
            {
                struct fs_node *node = vfs_lookup(NULL, path);

                if (node)
                    node->readonly = 1;
            }
        }
    }
}

static void print_motd(void)
{
    char    buffer[512];
    ssize_t n = vfs_read_file("/etc/motd", buffer, sizeof(buffer) - 1);

    if (n > 0) {
        buffer[n] = '\0';
        kprintf("\n%s", buffer);
    }
}

static void status_thread(void *arg)
{
    (void)arg;

    for (;;) {
        char line[81];
        size_t used = 0, freed = 0, total = 0;
        uint64_t seconds = timer_ms() / 1000;

        kheap_stats(&used, &freed, &total, NULL);
        ksnprintf(line, sizeof(line),
                  " SifarOS %s | up %u:%02u:%02u | threads %d | ram %u.%u/%u MiB | heap %u KiB",
                  SIFAROS_VERSION,
                  (uint32_t)(seconds / 3600),
                  (uint32_t)((seconds / 60) % 60),
                  (uint32_t)(seconds % 60),
                  thread_count(),
                  (uint32_t)(((uint64_t)pmm_used_frames() * PAGE_SIZE) / MB),
                  (uint32_t)(((((uint64_t)pmm_used_frames() * PAGE_SIZE) % MB) * 10) / MB),
                  (uint32_t)(((uint64_t)pmm_total_frames() * PAGE_SIZE) / MB),
                  (uint32_t)(used / KB));
        if (!gfx_available())
            vga_status(line);
        thread_sleep_ms(500);
    }
}

void kmain(struct bootinfo *info)
{
    console_init(info ? !info->fb_present : 1);

    if (!info || info->magic != BOOTINFO_MAGIC) {
        kprintf("kernel: bad boot information block\n");
        panic("cannot continue without a memory map");
    }
    boot_copy = *info;

    banner();

    gdt_init();
    idt_init();
    fault_init();
    pic_init();
    fpu_init();
    kprintf("cpu    : GDT, IDT, PIC and %s floating point installed\n",
            fpu_sse() ? "SSE" : "x87");

    pmm_init(&boot_copy);
    report_memory(&boot_copy);

    paging_init();
    kprintf("paging : enabled, %u pages mapped\n", vmm_mapped_pages());

    kheap_init();
    kprintf("heap   : ready\n");

    if (gfx_init(&boot_copy) == 0) {
        fbcon_init();
        console_attach_screen();
        kprintf("video  : %ux%u at %u bpp, framebuffer %p\n",
                boot_copy.fb_width, boot_copy.fb_height, boot_copy.fb_bpp,
                (void *)boot_copy.fb_addr);
    } else {
        kprintf("video  : no VESA framebuffer, staying in text mode\n");
    }

    timer_init(100);
    keyboard_init();
    mouse_init();
    if (gfx_available())
        mouse_set_bounds(gfx_width(), gfx_height());
    kprintf("timer  : PIT at %u Hz\n", timer_hz());
    kprintf("input  : PS/2 keyboard%s and COM1 serial console\n",
            mouse_present() ? ", PS/2 mouse" : "");

    proc_init();
    vfs_init();

    if (ata_init() == 0) {
        struct blockdev *disk = ata_device();

        kprintf("disk   : %s, %u MiB\n", ata_model(), disk->sectors / 2048);

        if (sfs_mount(disk, SFS_PARTITION_LBA) == 0) {
            uint64_t total = 0, free_bytes = 0;

            sfs_stats(&total, &free_bytes, NULL);
            kprintf("fs     : SifarFS \"%s\" mounted at /, %u MiB total, %u MiB free\n",
                    sfs_label(), (uint32_t)(total / MB), (uint32_t)(free_bytes / MB));
        } else {
            kprintf("fs     : no SifarFS on disk, falling back to ram\n");
            seed_filesystem();
        }
    } else {
        kprintf("disk   : no ATA drive found\n");
        seed_filesystem();
    }
    kprintf("fs     : %u nodes in the tree\n", vfs_node_count());

    syscall_init();
    kprintf("syscall: int 0x80 gate installed\n");

    sched_init();
    sti();

    thread_create("status", status_thread, NULL);
    thread_create("shell", shell_thread, NULL);
    kprintf("sched  : preemptive round robin, %d thread(s)\n", thread_count());

    kprintf("\nboot complete in %u ms\n", (uint32_t)timer_ms());
    print_motd();

    /* Hand the screen over to the window system and start the desktop. */
    if (wm_init() == 0) {
        const char *args[] = { "desktop" };
        int pid;

        wm_start();
        pid = proc_spawn("/apps/desktop", 1, args);
        if (pid < 0) {
            console_set_screen_output(1);
            kprintf("desktop: /apps/desktop did not start (error %d)\n", pid);
        } else {
            /* The desktop is the only user process allowed to manage other
             * applications' windows or invoke machine power controls. These
             * privileges are kernel-granted and are not inherited by apps the
             * desktop launches. */
            proc_grant_caps(pid, PROC_CAP_WINDOW_CONTROL | PROC_CAP_SYSTEM_CONTROL);
            kprintf("desktop: started as process %d with shell capabilities\n", pid);
        }
    }

    /* Thread 0 becomes the idle task: reap dead threads and wait for work. */
    for (;;) {
        sched_reap();
        proc_reap();
        __asm__ volatile("sti; hlt");
    }
}
