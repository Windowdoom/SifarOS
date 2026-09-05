/*
 * Sifar System Monitor.
 *
 * A live operational dashboard rather than a retro task-manager clone. The
 * dense process list remains available, but the first screen communicates
 * system health, capacity and the Adaptive Core clearly.
 */
#include "future_ui.h"

#define HISTORY 120

static struct sys_proc processes[32];
static const char *rows[32];
static char row_text[32][64];
static int process_count;
static int selected;
static int scroll;
static int history[HISTORY];
static int history_count;

static void sample(struct sys_info *info)
{
    int percent;

    if (system_info(info) < 0)
        return;

    percent = (int)((info->used_memory_kb * 100) /
                    (info->total_memory_kb ? info->total_memory_kb : 1));
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
                 (int)processes[i].pid, processes[i].name,
                 processes[i].memory_kb,
                 processes[i].state == 1 ? "running" : "zombie");
        rows[i] = row_text[i];
    }
}

static void draw_graph(ui_window *w, int x, int y, int width, int height)
{
    ui_round_fill(w, x, y, width, height, 10, UI_SURFACE);

    for (int i = 1; i < 4; i++)
        ui_blend(w, x + 12, y + (height * i) / 4, width - 24, 1,
                 UI_RGBA(0xFF, 0xFF, 0xFF, 14));

    for (int i = 1; i < history_count; i++) {
        int x0 = x + 12 + ((i - 1) * (width - 24)) / (HISTORY - 1);
        int x1 = x + 12 + (i * (width - 24)) / (HISTORY - 1);
        int y0 = y + height - 12 - (history[i - 1] * (height - 24)) / 100;
        int y1 = y + height - 12 - (history[i] * (height - 24)) / 100;

        ui_line(w, x0, y0, x1, y1, UI_GOOD);
        if (i == history_count - 1)
            ui_circle(w, x1, y1, 3, UI_GOOD);
    }
}

int main(int argc, char **argv)
{
    ui_window *window;
    struct sys_info info;
    int last_sample = -1000;

    (void)argc;
    (void)argv;
    ui_init();
    fu_init();

    window = ui_window_open("Sifar System Monitor", 760, 620, GUI_NORMAL);
    if (!window)
        return 1;

    memset(&info, 0, sizeof(info));
    sample(&info);

    while (ui_begin(window)) {
        int now = uptime_ms();
        int memory_percent;
        int disk_percent;
        int seconds;
        char memory_value[48];
        char disk_value[48];
        char process_value[48];
        char uptime_value[48];
        char machine_line[128];

        if (now - last_sample >= 500) {
            last_sample = now;
            sample(&info);
            window->dirty = 1;
        }

        if (!window->dirty) {
            ui_end(window);
            ui_frame_wait();
            continue;
        }

        memory_percent = (int)((info.used_memory_kb * 100) /
                               (info.total_memory_kb ? info.total_memory_kb : 1));
        disk_percent = info.disk_total_kb
                           ? (int)(((info.disk_total_kb - info.disk_free_kb) *
                                    100) /
                                   info.disk_total_kb)
                           : 0;
        seconds = info.uptime_ms / 1000;

        snprintf(memory_value, sizeof(memory_value), "%u / %u MiB",
                 info.used_memory_kb / 1024, info.total_memory_kb / 1024);
        snprintf(disk_value, sizeof(disk_value), "%u / %u MiB",
                 (info.disk_total_kb - info.disk_free_kb) / 1024,
                 info.disk_total_kb / 1024);
        snprintf(process_value, sizeof(process_value), "%u processes",
                 info.processes);
        snprintf(uptime_value, sizeof(uptime_value), "%d:%02d:%02d",
                 seconds / 3600, (seconds / 60) % 60, seconds % 60);
        snprintf(machine_line, sizeof(machine_line), "SifarOS %s  |  %s",
                 info.version, info.cpu);

        ui_gradient(window, 0, 0, window->width, window->height,
                    UI_RGB(0x07, 0x0B, 0x13), UI_RGB(0x0C, 0x14, 0x24));
        ui_blend(window, window->width / 2, 0, window->width / 2, 180,
                 UI_RGBA(0x45, 0xD3, 0x9A, 14));

        fu_section_title(window, 24, 20, "SYSTEM HEALTH",
                         "Everything important, at a glance");
        fu_text(window, 24, 86, machine_line, UI_TEXT_DIM);

        if (fu_button(window, window->width - 188, 26, 164, 34,
                      "Adaptive Center", UI_ACCENT)) {
            (void)spawn("/apps/adaptive", 0, NULL);
        }

        fu_metric(window, 24, 118, 168, "MEMORY", memory_value,
                  memory_percent < 80 ? "healthy" : "high use",
                  memory_percent < 80 ? UI_GOOD : UI_WARN);
        fu_metric(window, 208, 118, 168, "DISK", disk_value,
                  disk_percent < 85 ? "capacity OK" : "nearly full",
                  disk_percent < 85 ? UI_ACCENT : UI_WARN);
        fu_metric(window, 392, 118, 168, "WORKLOAD", process_value,
                  "live process set", UI_ACCENT_LIGHT);
        fu_metric(window, 576, 118, 160, "UPTIME", uptime_value,
                  "since boot", UI_GOOD);

        fu_card(window, 24, 228, window->width - 48, 142);
        fu_text(window, 40, 244, "MEMORY TREND", UI_TEXT_DIM);
        draw_graph(window, 40, 274, window->width - 80, 76);

        fu_card(window, 24, 388, window->width - 48, 158);
        fu_text(window, 40, 404, "RUNNING PROCESSES", UI_TEXT_DIM);
        ui_list(window, 40, 434, window->width - 80, 96, rows,
                process_count, &selected, &scroll);

        if (fu_button(window, 24, 566, 124, 32, "End process", UI_BAD)) {
            if (selected >= 0 && selected < process_count &&
                processes[selected].pid > 0)
                kill_process((int)processes[selected].pid);
        }

        fu_text(window, 164, 574,
                "Select a process for manual control. Adaptive policy remains kernel-owned.",
                UI_TEXT_DIM);

        ui_end(window);
        ui_frame_wait();
    }

    ui_window_close(window);
    return 0;
}
