/*
 * Sifar Files.
 *
 * Double click a directory to open it, or a file to hand it to the editor.
 * The UI emphasizes location and content instead of chrome-heavy controls.
 */
#include "future_ui.h"

#define MAX_ENTRIES 128

static struct sys_dirent entries[MAX_ENTRIES];
static const char *names[MAX_ENTRIES];
static char labels[MAX_ENTRIES][SYS_NAME_MAX + 16];
static int entry_count;
static int selected;
static int scroll;
static char path[192] = "/";
static char status[128];

static void reload(void)
{
    unsigned total = 0;

    entry_count = list_directory(path, entries, MAX_ENTRIES);
    if (entry_count < 0)
        entry_count = 0;

    for (int i = 0; i < entry_count; i++) {
        if (entries[i].type == 2)
            snprintf(labels[i], sizeof(labels[i]), "DIR   %s", entries[i].name);
        else
            snprintf(labels[i], sizeof(labels[i]), "FILE  %s", entries[i].name);
        names[i] = labels[i];
        total += entries[i].size;
    }

    if (selected >= entry_count)
        selected = entry_count - 1;
    if (selected < 0)
        selected = 0;
    scroll = 0;

    snprintf(status, sizeof(status), "%d items  |  %u KiB", entry_count,
             total / 1024);
}

static void enter_directory(const char *name)
{
    char next[192];

    if (strcmp(name, "..") == 0) {
        char *slash = strrchr(path, '/');

        if (slash && slash != path)
            *slash = '\0';
        else
            strlcpy(path, "/", sizeof(path));
        reload();
        return;
    }

    if (strcmp(path, "/") == 0)
        snprintf(next, sizeof(next), "/%s", name);
    else
        snprintf(next, sizeof(next), "%s/%s", path, name);
    strlcpy(path, next, sizeof(path));
    reload();
}

static void open_entry(int index)
{
    if (index < 0 || index >= entry_count)
        return;

    if (entries[index].type == 2) {
        enter_directory(entries[index].name);
        return;
    }

    {
        char full[192];
        const char *args[2];

        if (strcmp(path, "/") == 0)
            snprintf(full, sizeof(full), "/%s", entries[index].name);
        else
            snprintf(full, sizeof(full), "%s/%s", path, entries[index].name);

        args[0] = "editor";
        args[1] = full;
        if (spawn("/apps/editor", 2, args) < 0)
            strlcpy(status, "Could not open the editor", sizeof(status));
        else
            snprintf(status, sizeof(status), "Opened %s", entries[index].name);
    }
}

int main(int argc, char **argv)
{
    ui_window *window;
    char new_name[64] = "";

    ui_init();
    fu_init();

    window = ui_window_open("Sifar Files", 650, 500, GUI_NORMAL);
    if (!window)
        return 1;

    if (argc > 1)
        strlcpy(path, argv[1], sizeof(path));
    reload();

    while (ui_begin(window)) {
        int activated;
        int action_y = window->height - 98;

        if (ui_key(window, GUI_KEY_ESCAPE))
            break;

        ui_gradient(window, 0, 0, window->width, window->height,
                    UI_RGB(0x07, 0x0B, 0x13), UI_RGB(0x0C, 0x14, 0x24));
        ui_blend(window, window->width / 2, 0, window->width / 2, 140,
                 UI_RGBA(0x4F, 0x7D, 0xF3, 14));

        fu_text(window, 24, 18, "FILES", UI_ACCENT_LIGHT);
        fu_text(window, 24, 48, path, UI_TEXT);
        fu_text(window, 24, 72, status, UI_TEXT_DIM);

        if (fu_button(window, window->width - 92, 28, 68, 34, "Up",
                      UI_ACCENT)) {
            enter_directory("..");
            window->dirty = 1;
        }

        fu_card(window, 24, 104, window->width - 48,
                window->height - 224);
        fu_text(window, 40, 120, "CONTENT", UI_TEXT_DIM);

        activated = ui_list(window, 40, 150, window->width - 80,
                            window->height - 286, names, entry_count,
                            &selected, &scroll);
        if (activated >= 0)
            open_entry(activated);
        if (ui_key(window, GUI_KEY_ENTER))
            open_entry(selected);

        fu_card(window, 24, action_y - 18, window->width - 48, 88);
        fu_text(window, 40, action_y - 2, "NEW FOLDER", UI_TEXT_DIM);
        (void)fu_textbox(window, 40, action_y + 20, 230,
                         new_name, sizeof(new_name));

        if (fu_button(window, 282, action_y + 20, 100, 36,
                      "Create", UI_ACCENT) && new_name[0]) {
            char full[192];

            snprintf(full, sizeof(full), "%s%s%s", path,
                     strcmp(path, "/") == 0 ? "" : "/", new_name);
            if (make_directory(full) == 0) {
                new_name[0] = '\0';
                reload();
            } else {
                strlcpy(status, "Could not create that folder", sizeof(status));
            }
            window->dirty = 1;
        }

        if (fu_button(window, 394, action_y + 20, 96, 36,
                      "Open", UI_GOOD))
            open_entry(selected);

        if (fu_button(window, 502, action_y + 20, 104, 36,
                      "Delete", UI_BAD) &&
            selected >= 0 && selected < entry_count) {
            char full[192];

            snprintf(full, sizeof(full), "%s%s%s", path,
                     strcmp(path, "/") == 0 ? "" : "/",
                     entries[selected].name);
            if (file_delete(full) == 0)
                reload();
            else
                strlcpy(status, "Could not delete that item", sizeof(status));
            window->dirty = 1;
        }

        ui_end(window);
        ui_frame_wait();
    }

    ui_window_close(window);
    return 0;
}
