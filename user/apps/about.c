/*
 * About SifarOS: product identity plus live machine facts.
 */
#include "future_ui.h"

static void fact(ui_window *w, int x, int y, const char *label,
                 const char *value)
{
    fu_text(w, x, y, label, UI_TEXT_DIM);
    fu_text(w, x + 118, y, value, UI_TEXT);
}

int main(int argc, char **argv)
{
    ui_window *window;
    struct sys_info info;

    (void)argc;
    (void)argv;
    ui_init();
    fu_init();

    window = ui_window_open("About SifarOS", 660, 540, GUI_FIXED);
    if (!window)
        return 1;

    while (ui_begin(window)) {
        char memory[48];
        char disk[48];
        char uptime[48];
        char screen[48];
        char counts[48];
        int seconds;

        if (system_info(&info) < 0)
            break;

        snprintf(memory, sizeof(memory), "%u MiB total | %u MiB used",
                 info.total_memory_kb / 1024, info.used_memory_kb / 1024);
        snprintf(disk, sizeof(disk), "%u MiB total | %u MiB free",
                 info.disk_total_kb / 1024, info.disk_free_kb / 1024);
        seconds = info.uptime_ms / 1000;
        snprintf(uptime, sizeof(uptime), "%d:%02d:%02d",
                 seconds / 3600, (seconds / 60) % 60, seconds % 60);
        snprintf(screen, sizeof(screen), "%ux%u | 32 bpp",
                 info.screen_width, info.screen_height);
        snprintf(counts, sizeof(counts), "%u processes | %u threads",
                 info.processes, info.threads);

        ui_gradient(window, 0, 0, window->width, window->height,
                    UI_RGB(0x06, 0x0A, 0x12), UI_RGB(0x0D, 0x15, 0x25));
        ui_blend(window, 300, 0, 360, 220,
                 UI_RGBA(0x4F, 0x7D, 0xF3, 22));

        fu_text(window, 28, 24, "SIFAROS", UI_ACCENT_LIGHT);
        ui_text_scaled(window, 28, 52, "2.0", UI_WHITE, 4);
        fu_text(window, 28, 126,
                "An inspectable operating system that adapts without surrendering trust.",
                UI_TEXT);
        fu_text(window, 28, 150,
                "Native kernel. Native applications. Local policy. Hard security boundaries.",
                UI_TEXT_DIM);

        fu_chip(window, 28, 182, "PAE / NX", UI_GOOD);
        fu_chip(window, 132, 182, "ring 3", UI_GOOD);
        fu_chip(window, 222, 182, "Adaptive Core", UI_ACCENT);
        fu_chip(window, 354, 182, "Sentinel", UI_WARN);

        fu_card(window, 24, 228, 292, 276);
        fu_text(window, 40, 244, "THIS MACHINE", UI_TEXT_DIM);
        fact(window, 40, 278, "version", info.version);
        fact(window, 40, 306, "processor", info.cpu);
        fact(window, 40, 334, "memory", memory);
        fact(window, 40, 362, "disk", disk);
        fact(window, 40, 390, "display", screen);
        fact(window, 40, 418, "running", counts);
        fact(window, 40, 446, "uptime", uptime);

        fu_card(window, 334, 228, 302, 276);
        fu_text(window, 350, 244, "WHAT MAKES SIFAROS DIFFERENT", UI_TEXT_DIM);

        ui_circle(window, 358, 282, 4, UI_ACCENT);
        fu_text(window, 374, 274, "Explainable cross-layer adaptation", UI_TEXT);
        fu_text(window, 374, 294, "Scheduling, security and network policy", UI_TEXT_DIM);

        ui_circle(window, 358, 334, 4, UI_GOOD);
        fu_text(window, 374, 326, "Capability-confined native apps", UI_TEXT);
        fu_text(window, 374, 346, "No browser or app gets raw kernel trust", UI_TEXT_DIM);

        ui_circle(window, 358, 386, 4, UI_WARN);
        fu_text(window, 374, 378, "Security invariants do not adapt away", UI_TEXT);
        fu_text(window, 374, 398, "W^X, isolation and policy remain hard", UI_TEXT_DIM);

        ui_circle(window, 358, 438, 4, UI_ACCENT_LIGHT);
        fu_text(window, 374, 430, "Future input is semantic", UI_TEXT);
        fu_text(window, 374, 450, "Mouse today; gaze, voice or EMG later", UI_TEXT_DIM);

        fu_text(window, 350, 482,
                "Built from scratch. Still experimental. Claims must be earned.",
                UI_TEXT_DIM);

        ui_end(window);
        sleep_ms(500);
        window->dirty = 1;
    }

    ui_window_close(window);
    return 0;
}
