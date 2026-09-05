/*
 * About: what this system is and what it is made of.
 */
#include "ui.h"

struct fact {
    const char *label;
    const char *value;
};

int main(int argc, char **argv)
{
    ui_window *window;
    struct sys_info info;
    char memory[48], disk[48], uptime[48], screen[48], counts[48];

    ui_init();
    window = ui_window_open("About SifarOS", 560, 460, GUI_FIXED);
    if (!window)
        return 1;

    while (ui_begin(window)) {
        int y;

        if (system_info(&info) < 0)
            break;

        snprintf(memory, sizeof(memory), "%u MiB total, %u MiB in use",
                 info.total_memory_kb / 1024, info.used_memory_kb / 1024);
        snprintf(disk, sizeof(disk), "%u MiB, %u MiB free",
                 info.disk_total_kb / 1024, info.disk_free_kb / 1024);
        {
            int seconds = info.uptime_ms / 1000;

            snprintf(uptime, sizeof(uptime), "%d:%02d:%02d",
                     seconds / 3600, (seconds / 60) % 60, seconds % 60);
        }
        snprintf(screen, sizeof(screen), "%ux%u, 32 bits per pixel",
                 info.screen_width, info.screen_height);
        snprintf(counts, sizeof(counts), "%u processes, %u kernel threads",
                 info.processes, info.threads);

        ui_clear(window, UI_BG);
        ui_gradient(window, 0, 0, window->width, 110,
                    UI_RGB(0x1E, 0x36, 0x5C), UI_RGB(0x14, 0x1E, 0x30));

        ui_text_scaled(window, 24, 26, "SifarOS", UI_WHITE, 3);
        ui_text(window, 26, 76, "a 32-bit operating system written from scratch",
                UI_TEXT_DIM);

        y = 130;
        {
            struct fact facts[] = {
                { "version",   info.version },
                { "processor", info.cpu },
                { "memory",    memory },
                { "disk",      disk },
                { "display",   screen },
                { "running",   counts },
                { "uptime",    uptime },
            };

            for (unsigned i = 0; i < sizeof(facts) / sizeof(facts[0]); i++) {
                ui_text(window, 26, y, facts[i].label, UI_TEXT_DIM);
                ui_text(window, 140, y, facts[i].value, UI_TEXT);
                y += 24;
            }
        }

        y += 8;
        ui_fill(window, 24, y, window->width - 48, 1, UI_BORDER);
        y += 14;

        ui_text(window, 26, y, "everything here is original code:", UI_TEXT);
        y += 24;
        {
            static const char *parts[] = {
                "boot sector and loader, protected mode entry",
                "kernel: paging, heap, scheduler, syscalls, ELF loader",
                "drivers: VESA, PS/2 keyboard and mouse, ATA, PIT, RTC, UART",
                "SifarFS on disk, VFS on top of it",
                "window server with damage tracked compositing",
                "libsifar and the widget toolkit these windows use",
            };

            for (unsigned i = 0; i < sizeof(parts) / sizeof(parts[0]); i++) {
                ui_fill(window, 30, y + 7, 4, 4, UI_ACCENT);
                ui_text(window, 44, y, parts[i], UI_TEXT_DIM);
                y += 20;
            }
        }

        ui_end(window);
        sleep_ms(500);
        window->dirty = 1;
    }

    ui_window_close(window);
    return 0;
}
