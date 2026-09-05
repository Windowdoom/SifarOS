/*
 * Sifar Settings.
 *
 * Preferences are written to /etc/desktop.conf; the desktop watches that file
 * and picks up changes. Every control shown here has a real effect today.
 */
#include "future_ui.h"

#define CONFIG "/etc/desktop.conf"

static const char *theme_names[] = {
    "Midnight", "Slate", "Forest", "Plum", "Ember",
};

static const uint32_t theme_colors[][2] = {
    {0xFF0A0F1C, 0xFF213A66},
    {0xFF11151C, 0xFF3B4658},
    {0xFF0A1712, 0xFF24533B},
    {0xFF17101E, 0xFF50305E},
    {0xFF1B100B, 0xFF69371C},
};

static int theme;
static int show_grid = 1;
static char status[96] = "Changes apply to the desktop automatically";

static void load_config(void)
{
    char buffer[128];
    int n = file_read(CONFIG, buffer, sizeof(buffer) - 1);

    if (n <= 0)
        return;
    buffer[n] = '\0';

    for (char *p = buffer; *p; p++) {
        if (strncmp(p, "theme=", 6) == 0)
            theme = atoi(p + 6);
        else if (strncmp(p, "grid=", 5) == 0)
            show_grid = atoi(p + 5);
    }

    if (theme < 0 ||
        theme >= (int)(sizeof(theme_names) / sizeof(theme_names[0])))
        theme = 0;
}

static void save_config(void)
{
    char buffer[128];
    int length = snprintf(buffer, sizeof(buffer), "theme=%d\ngrid=%d\n",
                          theme, show_grid);

    if (file_write(CONFIG, buffer, (size_t)length) < 0)
        strlcpy(status, "Could not save preferences", sizeof(status));
    else
        strlcpy(status, "Saved. The desktop will update shortly", sizeof(status));
}

static int theme_card(ui_window *w, int x, int y, int width, int index)
{
    int selected = theme == index;
    int hovered = ui_hit(w, x, y, width, 66);

    ui_round_fill(w, x + 2, y + 4, width, 66, 12,
                  UI_RGB(0x05, 0x08, 0x0D));
    ui_round_fill(w, x, y, width, 66, 12,
                  selected ? UI_PANEL_LIGHT : UI_PANEL);
    ui_gradient(w, x + 10, y + 10, 48, 46,
                theme_colors[index][0], theme_colors[index][1]);
    ui_round_fill(w, x + 68, y + 11, width - 78, 44, 9,
                  hovered ? UI_SURFACE_ALT : UI_SURFACE);
    fu_text(w, x + 80, y + 18, theme_names[index], UI_TEXT);
    fu_text(w, x + 80, y + 38, selected ? "active" : "preview",
            selected ? UI_ACCENT_LIGHT : UI_TEXT_DIM);

    if (selected) {
        ui_circle(w, x + width - 16, y + 16, 5, UI_ACCENT);
        ui_circle(w, x + width - 16, y + 16, 2, UI_WHITE);
    }

    return hovered && w->mouse_pressed;
}

int main(int argc, char **argv)
{
    ui_window *window;

    (void)argc;
    (void)argv;
    ui_init();
    fu_init();

    window = ui_window_open("Sifar Settings", 620, 560, GUI_FIXED);
    if (!window)
        return 1;

    load_config();

    while (ui_begin(window)) {
        ui_gradient(window, 0, 0, window->width, window->height,
                    UI_RGB(0x07, 0x0B, 0x13), UI_RGB(0x0D, 0x15, 0x25));
        ui_blend(window, window->width / 2, 0, window->width / 2, 180,
                 UI_RGBA(0x4F, 0x7D, 0xF3, 16));

        fu_section_title(window, 24, 22, "PERSONALIZE",
                         "Make the system feel like yours");
        fu_text(window, 24, 88,
                "Only settings with a real system effect are shown here.",
                UI_TEXT_DIM);

        fu_card(window, 24, 122, window->width - 48, 242);
        fu_text(window, 40, 138, "DESKTOP THEME", UI_TEXT_DIM);

        for (unsigned i = 0;
             i < sizeof(theme_names) / sizeof(theme_names[0]); i++) {
            int col = (int)(i % 2);
            int row = (int)(i / 2);
            int x = 40 + col * 278;
            int y = 168 + row * 72;

            if (theme_card(window, x, y, 258, (int)i)) {
                theme = (int)i;
                save_config();
                window->dirty = 1;
            }
        }

        fu_card(window, 24, 382, window->width - 48, 70);
        fu_text(window, 40, 398, "DESKTOP", UI_TEXT_DIM);
        if (ui_toggle(window, 40, 424, "show spatial grid", &show_grid))
            save_config();

        fu_card(window, 24, 470, window->width - 48, 66);
        if (fu_button(window, 40, 486, 124, 34, "Restart", UI_WARN))
            reboot();
        if (fu_button(window, 176, 486, 124, 34, "Shut down", UI_BAD))
            shutdown();
        if (fu_button(window, 312, 486, 124, 34, "Save now", UI_ACCENT))
            save_config();

        fu_text(window, 40, 544, status, UI_TEXT_DIM);

        ui_end(window);
        ui_frame_wait();
    }

    ui_window_close(window);
    return 0;
}
