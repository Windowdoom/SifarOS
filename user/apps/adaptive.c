/*
 * Sifar Adaptive Center.
 *
 * Shows what the Adaptive Core is doing instead of asking the user to trust a
 * marketing claim. The app reads ordinary system information plus the kernel's
 * tamper-resistant transition log. It cannot change policy or weaken security
 * invariants.
 */
#include "future_ui.h"

#define LOG_CAP 8192
#define HISTORY 10

static char log_buffer[LOG_CAP];
static char current_mode[24] = "balanced";
static char current_policy[96] = "q=5, net=64 KiB";
static char current_reason[32] = "boot-default";
static char current_evidence[128] = "waiting for first policy transition";
static char history[HISTORY][128];
static int history_count;
static int transition_generation = 1;

static int starts_with(const char *text, const char *prefix)
{
    return strncmp(text, prefix, strlen(prefix)) == 0;
}

static char *find_sequence(char *text, const char *needle)
{
    size_t needle_len = strlen(needle);

    if (!needle_len)
        return text;
    for (; *text; text++) {
        if (strncmp(text, needle, needle_len) == 0)
            return text;
    }
    return NULL;
}

static void copy_token(char *out, size_t out_cap, const char *start)
{
    size_t n = 0;

    if (!out_cap)
        return;
    while (start[n] && start[n] != ' ' && start[n] != '\n' &&
           n + 1 < out_cap)
        n++;
    memcpy(out, start, n);
    out[n] = '\0';
}

static const char *reason_explanation(const char *reason)
{
    if (strcmp(reason, "threat") == 0)
        return "Sentinel escalation crossed the containment threshold";
    if (strcmp(reason, "low-memory") == 0)
        return "free memory crossed the low-memory threshold";
    if (strcmp(reason, "memory+runqueue") == 0)
        return "memory pressure and runnable work rose together";
    if (strcmp(reason, "interaction") == 0)
        return "recent human input requested lower interaction latency";
    if (strcmp(reason, "runqueue") == 0)
        return "the runnable queue grew beyond the balanced target";
    if (strcmp(reason, "user-workload") == 0)
        return "multiple user workloads became active together";
    if (strcmp(reason, "idle") == 0)
        return "the machine stayed quiet long enough to reduce churn";
    if (strcmp(reason, "steady") == 0)
        return "load returned to the balanced operating envelope";
    return "the kernel is still collecting enough evidence to transition";
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
}

static void parse_transition(char *line)
{
    char *arrow = find_sequence(line, " -> ");
    char *paren = strchr(line, '(');
    char *reason = find_sequence(line, "reason=");
    char *run = find_sequence(line, "run=");
    char *free_mem = find_sequence(line, "free=");
    char *threat = find_sequence(line, "threat=");
    char *generation = find_sequence(line, "gen=");

    if (arrow) {
        char *mode_start = arrow + 4;
        char *mode_end = mode_start;
        int mlen;

        while (*mode_end && *mode_end != ' ' && *mode_end != '(')
            mode_end++;
        mlen = (int)(mode_end - mode_start);
        if (mlen > 0 && mlen < (int)sizeof(current_mode)) {
            memcpy(current_mode, mode_start, (size_t)mlen);
            current_mode[mlen] = '\0';
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

    if (reason)
        copy_token(current_reason, sizeof(current_reason), reason + 7);

    {
        char run_value[20] = "?";
        char free_value[20] = "?";
        char threat_value[20] = "?";
        char gen_value[20] = "?";

        if (run)
            copy_token(run_value, sizeof(run_value), run + 4);
        if (free_mem)
            copy_token(free_value, sizeof(free_value), free_mem + 5);
        if (threat)
            copy_token(threat_value, sizeof(threat_value), threat + 7);
        if (generation)
            copy_token(gen_value, sizeof(gen_value), generation + 4);

        snprintf(current_evidence, sizeof(current_evidence),
                 "run %s  |  free %s  |  threat %s  |  generation %s",
                 run_value, free_value, threat_value, gen_value);
        if (generation)
            transition_generation = atoi(gen_value);
    }
}

static void parse_adaptive_log(void)
{
    int n = kernel_log(log_buffer, sizeof(log_buffer) - 1);
    char last_line[128] = "";

    if (n <= 0)
        return;
    log_buffer[n] = '\0';

    for (char *p = log_buffer; *p;) {
        char *end = strchr(p, '\n');
        int length = end ? (int)(end - p) : (int)strlen(p);

        if (length > 8 && starts_with(p, "adapt  : ")) {
            char line[192];
            int take = length;

            if (take >= (int)sizeof(line))
                take = (int)sizeof(line) - 1;
            memcpy(line, p, (size_t)take);
            line[take] = '\0';

            if (!find_sequence(line, "self-adapting policy engine online") &&
                find_sequence(line, " -> ")) {
                parse_transition(line);
                strlcpy(last_line, line + 9, sizeof(last_line));
            }
        }

        if (!end)
            break;
        p = end + 1;
    }

    if (last_line[0] &&
        (!history_count || strcmp(history[history_count - 1], last_line) != 0))
        remember_transition(last_line);
}

static void draw_history(ui_window *w, int x, int y, int width, int height)
{
    int shown;
    int first;

    fu_card(w, x, y, width, height);
    fu_text(w, x + 16, y + 14, "POLICY TRANSITIONS", UI_TEXT_DIM);

    if (!history_count) {
        fu_text(w, x + 16, y + 46,
                "No transition yet. Move, launch apps, or add workload.",
                UI_TEXT_DIM);
        return;
    }

    shown = history_count < 5 ? history_count : 5;
    first = history_count - shown;
    for (int i = 0; i < shown; i++) {
        int row = first + i;
        ui_circle(w, x + 21, y + 48 + i * 32, 3, UI_ACCENT_LIGHT);
        fu_text(w, x + 34, y + 40 + i * 32, history[row], UI_TEXT);
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

    window = ui_window_open("Sifar Adaptive Center", 820, 640, GUI_NORMAL);
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
        strlcpy(policy, current_policy, sizeof(policy));

        ui_gradient(window, 0, 0, window->width, window->height,
                    UI_RGB(0x07, 0x0B, 0x13), UI_RGB(0x0D, 0x15, 0x25));
        ui_blend(window, window->width / 2, 0, window->width / 2, 190,
                 UI_RGBA(0x4F, 0x7D, 0xF3, 18));

        fu_section_title(window, 24, 22, "SIFAR ADAPTIVE CORE",
                         "Explainable adaptation, not a black box");
        fu_chip(window, window->width - 180, 26, current_mode, mode_color);

        fu_text(window, 24, 88, reason_explanation(current_reason), UI_TEXT_DIM);
        fu_text(window, 24, 112, current_evidence, UI_TEXT_DIM);

        fu_metric(window, 24, 150, 238, "ACTIVE MODE", current_mode,
                  generation, mode_color);
        fu_metric(window, 282, 150, 238, "RESOURCE STATE", memory,
                  activity, UI_GOOD);
        fu_metric(window, 540, 150, 256, "POLICY OUTPUT", policy,
                  "scheduler + network", UI_ACCENT);

        fu_card(window, 24, 262, window->width - 48, 74);
        fu_text(window, 40, 278, "WHY THIS MODE", UI_ACCENT_LIGHT);
        fu_text(window, 40, 304, current_reason, mode_color);
        fu_text(window, 170, 304, reason_explanation(current_reason), UI_TEXT);

        draw_history(window, 24, 354, window->width - 48, 190);

        fu_card(window, 24, 562, window->width - 48, 54);
        fu_text(window, 40, 574,
                "Input -> responsive | resource pressure -> pressure | Sentinel -> defensive",
                UI_TEXT);
        fu_text(window, 40, 596,
                "Hard security invariants never adapt away.", UI_TEXT_DIM);

        ui_end(window);
        ui_frame_wait();
    }

    ui_window_close(window);
    return 0;
}
