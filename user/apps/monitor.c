/*
 * System monitor: live memory, process and disk figures straight from the
 * kernel, with a history graph of memory use.
 */
#include "ui.h"

#define HISTORY 120

static struct sys_proc processes[32];
static const char     *rows[32];
static char            row_text[32][64];
static int             process_count;
static int             selected;
static int             scroll;
static int             history[HISTORY];
static int             history_count;

static void sample(struct sys_info *info)
{
    int percent;

    if (system_info(info) < 0)
        return;

    percent = (int)((info->used_memory_kb * 100) / (info->total_memory_kb ? info->total_memory_kb : 1));
    if (history_count < HISTORY) {
        history[history_count++] = percent;
    } else {
        for (int i = 1; i < HISTORY; i++)
            history[i - 1] = history[i];
        history[HISTORY - 1] = percent;
    }

    process_count = process_list(processes, 32);
    if (process_count < 0)
        process_count = 0;

    for (int i = 0; i < process_count; i++) {
        snprintf(row_text[i], sizeof(row_text[i]), "%d  %s  %u KiB  %s",
                 (int)processes[i].pid, processes[i].name, processes[i].memory_kb,
                 processes[i].state == 1 ? "running" : "zombie");
        rows[i] = row_text[i];
    }
}

static void draw_graph(ui_window *window, int x, int y, int w, int h)
{
    ui_fill(window, x, y, w, h, 0xFF16202E);
    ui_frame(window, x, y, w, h, UI_BORDER);

    for (int i = 1; i < 4; i++)
        ui_blend(window, x + 1, y + (h * i) / 4, w - 2, 1, UI_RGBA(0xFF, 0xFF, 0xFF, 18));

    for (int i = 1; i < history_count; i++) {
        int x0 = x + ((i - 1) * (w - 2)) / (HISTORY - 1) + 1;
        int x1 = x + (i * (w - 2)) / (HISTORY - 1) + 1;
        int y0 = y + h - 1 - (history[i - 1] * (h - 2)) / 100;
        int y1 = y + h - 1 - (history[i] * (h - 2)) / 100;

        ui_line(window, x0, y0, x1, y1, UI_GOOD);
    }
}

int main(int argc, char **argv)
{
    ui_window *window;
    struct sys_info info;
    int last_sample = 0;

    ui_init();
    window = ui_window_open("System Monitor", 620, 520, GUI_NORMAL);
    if (!window)
        return 1;

    memset(&info, 0, sizeof(info));
    sample(&info);

    while (ui_begin(window)) {
        int now = uptime_ms();

        if (now - last_sample > 500) {
            last_sample = now;
            sample(&info);
            window->dirty = 1;
        }

        if (!window->dirty) {
            ui_end(window);
            ui_frame_wait();
            continue;
        }

        ui_clear(window, UI_BG);

        /* Summary */
        ui_panel(window, 10, 10, window->width - 20, 132, "System");
        {
            char line[128];
            int seconds = info.uptime_ms / 1000;

            snprintf(line, sizeof(line), "SifarOS %s on %s", info.version, info.cpu);
            ui_text(window, 22, 42, line, UI_TEXT);

            snprintf(line, sizeof(line), "up %d:%02d:%02d   %u processes   %u threads   screen %ux%u",
                     seconds / 3600, (seconds / 60) % 60, seconds % 60,
                     info.processes, info.threads, info.screen_width, info.screen_height);
            ui_text(window, 22, 62, line, UI_TEXT_DIM);

            snprintf(line, sizeof(line), "memory  %u / %u MiB",
                     info.used_memory_kb / 1024, info.total_memory_kb / 1024);
            ui_text(window, 22, 88, line, UI_TEXT);
            ui_progress(window, 220, 88, window->width - 250, 14,
                        (int)((info.used_memory_kb * 100) /
                              (info.total_memory_kb ? info.total_memory_kb : 1)),
                        UI_ACCENT);

            snprintf(line, sizeof(line), "disk    %u / %u MiB",
                     (info.disk_total_kb - info.disk_free_kb) / 1024,
                     info.disk_total_kb / 1024);
            ui_text(window, 22, 112, line, UI_TEXT);
            ui_progress(window, 220, 112, window->width - 250, 14,
                        info.disk_total_kb ?
                        (int)(((info.disk_total_kb - info.disk_free_kb) * 100) /
                              info.disk_total_kb) : 0,
                        UI_GOOD);
        }

        /* Memory history */
        ui_panel(window, 10, 152, window->width - 20, 130, "Memory use");
        draw_graph(window, 22, 186, window->width - 44, 86);

        /* Processes */
        ui_panel(window, 10, 292, window->width - 20, window->height - 342, "Processes");
        ui_list(window, 22, 326, window->width - 44, window->height - 388,
                rows, process_count, &selected, &scroll);

        if (ui_button_colored(window, window->width - 120, window->height - 42,
                              104, 28, "End process", UI_BAD)) {
            if (selected >= 0 && selected < process_count && processes[selected].pid > 0)
                kill_process((int)processes[selected].pid);
        }
        ui_text(window, 22, window->height - 36,
                "select a process and end it, or leave this window open to watch",
                UI_TEXT_DIM);

        ui_end(window);
        ui_frame_wait();
    }

    ui_window_close(window);
    return 0;
}
