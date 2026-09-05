/*
 * Sifar Adaptive Center.
 *
 * Shows what the Adaptive Core is doing instead of asking the user to trust a
 * marketing claim. The app reads ordinary system information plus the kernel's
 * tamper-resistant log. It cannot change policy or weaken security invariants.
 */
#include "future_ui.h"

#define LOG_CAP 8192
#define HISTORY 10

static char log_buffer[LOG_CAP];
static char current_mode[24] = "balanced";
static char current_policy[96] = "q=5, net=64 KiB";
static char history[HISTORY][96];
static int history_count;
static int transition_generation = 1;

static int starts_with(const char *text, const char *prefix)
{
    return strncmp(text, prefix, strlen(prefix)) == 0;
}

static const char *mode_reason(const char *mode)
{
    if (strcmp(mode, "defensive") == 0)
        return "security escalation: contain first, reconnect later";
    if (strcmp(mode, "pressure") == 0)
        return "resource pressure: reduce churn and network footprint";
    if (strcmp(mode, "responsive") == 0)
        return "active workload/input: favor interaction latency";
    if (strcmp(mode, "quiet") == 0)
        return "low activity: stretch background cadence";
    return "normal workload: balanced latency and throughput";
}

static void remember_transition(const char *line)
{
    if (!line || !*line)
        return;

    if (history_count < HISTORY) {
        strlcpy(history[history_count++], line, sizeof(history[0]));
    } else {
        for (int i = 1; i < HISTORY; i++)
            strlcpy(history[i - 1], history[i], sizeof(history[0]));
        strlcpy(history[HISTORY - 1], line, sizeof(history[0]));
    }
    transition_generation++;
}

static void parse_adaptive_log(void)
{
    int n = kernel_log(log_buffer, sizeof(log_buffer) - 1);
    char last_line[96] = "";

    if (n <= 0)
        return;
    log_buffer[n] = '\0';

    for (char *p = log_buffer; *p;) {
        char *end = strchr(p, '\n');
        int length = end ? (int)(end - p) : (int)strlen(p);

        if (length > 8 && starts_with(p, "adapt  : ")) {
            char line[96];
            int take = length;
            char *arrow;
            char *paren;

            if (take >= (int)sizeof(line))
                take = (int)sizeof(line) - 1;
            memcpy(line, p, (size_t)take);
            line[take] = '\0';

            if (strstr(line, "self-adapting policy engine online") == NULL) {
                arrow = strstr(line, " -> ");
                paren = strchr(line, '(');
                if (arrow) {
                    char *mode_start = arrow + 4;
                    char *mode_end = mode_start;
                    while (*mode_end && *mode_end != ' ' && *mode_end != '(')
                        mode_end++;
                    {
                        int mlen = (int)(mode_end - mode_start);
                        if (mlen > 0 && mlen < (int)sizeof(current_mode)) {
                            memcpy(current_mode, mode_start, (size_t)mlen);
                            current_mode[mlen] = '\0';
                        }
                    }
                }
                if (paren) {
                    char *close = strchr(paren, ')');
                    int plen = close ? (int)(close - paren - 1) : 0;
                    if (plen > 0) {
                        if (plen >= (int)sizeof(current_policy))
                            plen = (int)sizeof(current_policy) - 1;
                        memcpy(current_policy, paren + 1, (size_t)plen);
                        current_policy[plen] = '\0';
                    }
                }
                strlcpy(last_line, line + 9, sizeof(last_line));
            }
        }

        if (!end)
            break;
        p = end + 1;
    }

    if (last_line[0]) {
        if (!history_count || strcmp(history[history_count - 1], last_line) != 0)
            remember_transition(last_line);
    }
}

static void draw_history(ui_window *w, int x, int y, int width, int height)
{
    fu_card(w, x, y, width, height);
    fu_text(w, x + 16, y + 14, "POLICY TRANSITIONS", UI_TEXT_DIM);

    if (!history_count) {
        fu_text(w, x + 16, y + 46,
                "No mode transition yet. Move, launch apps, or add load.",
                UI_TEXT_DIM);
        return;
    }

    int shown = history_count < 6 ? history_count : 6;
    int first = history_count - shown;
    for (int i = 0; i < shown; i++) {
        int row = first + i;
        ui_circle(w, x + 21, y + 48 + i * 28, 3, UI_ACCENT_LIGHT);
        fu_text(w, x + 34, y + 40 + i * 28, history[row], UI_TEXT);
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

    window = ui_window_open("Sifar Adaptive Center", 780, 600, GUI_NORMAL);
    if (!window)
        return 1;

    memset(&info, 0, sizeof(info));

    while (ui_begin(window)) {
        int now = uptime_ms();
        uint32_t mode_color;
        char memory[48];
        char activity[48];
        char generation[48];
        char policy[96];

        if (now - last_sample >= 250) {
            last_sample = now;
            memset(&info, 0, sizeof(info));
            system_info(&info);
            parse_adaptive_log();
            window->dirty = 1;
        }

        if (!window->dirty) {
            ui_end(window);
            ui_frame_wait();
            continue;
        }

        mode_color = fu_mode_color(current_mode);
        snprintf(memory, sizeof(memory), "%u MiB free",
                 (info.total_memory_kb > info.used_memory_kb)
                     ? (info.total_memory_kb - info.used_memory_kb) / 1024
                     : 0);
        snprintf(activity, sizeof(activity), "%u proc / %u threads",
                 info.processes, info.threads);
        snprintf(generation, sizeof(generation), "generation %d",
                 transition_generation);
        snprintf(policy, sizeof(policy), "%s", current_policy);

        ui_gradient(window, 0, 0, window->width, window->height,
                    UI_RGB(0x07, 0x0B, 0x13), UI_RGB(0x0D, 0x15, 0x25));
        ui_blend(window, window->width / 2, 0, window->width / 2, 180,
                 UI_RGBA(0x4F, 0x7D, 0xF3, 18));

        fu_section_title(window, 24, 22, "SIFAR ADAPTIVE CORE",
                         "The OS is changing around the workload");
        fu_chip(window, window->width - 176, 26, current_mode, mode_color);

        fu_text(window, 24, 88, mode_reason(current_mode), UI_TEXT_DIM);
        fu_text(window, 24, 112,
                "Observe-only view: applications cannot weaken kernel policy.",
                UI_TEXT_DIM);

        fu_metric(window, 24, 150, 226, "ACTIVE MODE", current_mode,
                  generation, mode_color);
        fu_metric(window, 270, 150, 226, "RESOURCE STATE", memory,
                  activity, UI_GOOD);
        fu_metric(window, 516, 150, 240, "POLICY OUTPUT", policy,
                  "scheduler + network", UI_ACCENT);

        draw_history(window, 24, 266, window->width - 48, 214);

        fu_card(window, 24, 498, window->width - 48, 76);
        fu_text(window, 40, 512, "HOW TO SEE IT ADAPT", UI_ACCENT_LIGHT);
        fu_text(window, 40, 538,
                "Interact -> responsive. Add load -> pressure. Sentinel escalation -> defensive.",
                UI_TEXT);
        fu_text(window, 40, 558,
                "Quiet periods stretch cadence. Security invariants never become optional.",
                UI_TEXT_DIM);

        ui_end(window);
        ui_frame_wait();
    }

    ui_window_close(window);
    return 0;
}
