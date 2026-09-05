/*
 * Settings.
 *
 * Preferences are written to /etc/desktop.conf; the desktop watches that file
 * and picks up changes, which is the simplest kind of message passing there
 * is - both sides already agree on the filesystem.
 */
#include "ui.h"

#define CONFIG "/etc/desktop.conf"

static const char *theme_names[] = {
    "Midnight", "Slate", "Forest", "Plum", "Ember",
};

static const uint32_t theme_colors[][2] = {
    { 0xFF141E34, 0xFF2A3E62 },
    { 0xFF1C2026, 0xFF39424E },
    { 0xFF12241A, 0xFF265038 },
    { 0xFF241428, 0xFF4A2A54 },
    { 0xFF2A1810, 0xFF5A2E18 },
};

static int  theme = 0;
static int  show_grid = 1;
static char status[96] = "";

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
    if (theme < 0 || theme >= (int)(sizeof(theme_names) / sizeof(theme_names[0])))
        theme = 0;
}

static void save_config(void)
{
    char buffer[128];
    int length = snprintf(buffer, sizeof(buffer), "theme=%d\ngrid=%d\n",
                          theme, show_grid);

    if (file_write(CONFIG, buffer, length) < 0)
        strlcpy(status, "could not write the settings file", sizeof(status));
    else
        strlcpy(status, "saved, the desktop picks this up in a moment", sizeof(status));
}

int main(int argc, char **argv)
{
    ui_window *window;

    ui_init();
    window = ui_window_open("Settings", 480, 420, GUI_FIXED);
    if (!window)
        return 1;

    load_config();

    while (ui_begin(window)) {
        int y;

        ui_clear(window, UI_BG);
        ui_text_scaled(window, 20, 18, "Settings", UI_TEXT, 2);

        ui_panel(window, 16, 60, window->width - 32, 176, "Desktop theme");
        y = 96;
        for (unsigned i = 0; i < sizeof(theme_names) / sizeof(theme_names[0]); i++) {
            int x = 28 + (int)(i % 3) * 146;
            int row = (int)(i / 3);
            int box_y = y + row * 62;
            int selected = (theme == (int)i);

            ui_gradient(window, x, box_y, 130, 44, theme_colors[i][0], theme_colors[i][1]);
            ui_frame(window, x, box_y, 130, 44, selected ? UI_ACCENT_LIGHT : UI_BORDER);
            if (selected)
                ui_frame(window, x - 1, box_y - 1, 132, 46, UI_ACCENT_LIGHT);
            ui_text(window, x + 8, box_y + 14, theme_names[i], UI_WHITE);

            if (ui_hit(window, x, box_y, 130, 44) && window->mouse_pressed) {
                theme = (int)i;
                save_config();
                window->dirty = 1;
            }
        }

        ui_panel(window, 16, 248, window->width - 32, 76, "Appearance");
        if (ui_toggle(window, 30, 284, "show the desktop grid", &show_grid))
            save_config();

        if (ui_button_colored(window, 16, 340, 140, 32, "Restart", UI_WARN))
            reboot();
        if (ui_button_colored(window, 166, 340, 140, 32, "Shut down", UI_BAD))
            shutdown();
        if (ui_button(window, 316, 340, 140, 32, "Save now"))
            save_config();

        ui_text(window, 20, window->height - 26, status, UI_TEXT_DIM);

        ui_end(window);
        ui_frame_wait();
    }

    ui_window_close(window);
    return 0;
}
