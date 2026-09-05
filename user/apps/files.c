/*
 * Files: a small file manager.
 *
 * Double click a directory to open it, a text file to hand it to the editor.
 */
#include "ui.h"

#define MAX_ENTRIES 128

static struct sys_dirent entries[MAX_ENTRIES];
static const char       *names[MAX_ENTRIES];
static char              labels[MAX_ENTRIES][SYS_NAME_MAX + 12];
static int               entry_count;
static int               selected;
static int               scroll;
static char              path[192] = "/";
static char              status[128];

static void reload(void)
{
    entry_count = list_directory(path, entries, MAX_ENTRIES);
    if (entry_count < 0)
        entry_count = 0;

    for (int i = 0; i < entry_count; i++) {
        if (entries[i].type == 2)
            snprintf(labels[i], sizeof(labels[i]), "[ ] %s", entries[i].name);
        else
            snprintf(labels[i], sizeof(labels[i]), "    %s", entries[i].name);
        names[i] = labels[i];
    }

    if (selected >= entry_count)
        selected = entry_count - 1;
    if (selected < 0)
        selected = 0;
    scroll = 0;

    {
        unsigned total = 0;

        for (int i = 0; i < entry_count; i++)
            total += entries[i].size;
        snprintf(status, sizeof(status), "%d items, %u KiB", entry_count, total / 1024);
    }
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

    /* Files go to the editor, with the full path as its argument. */
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
            snprintf(status, sizeof(status), "cannot open the editor");
        else
            snprintf(status, sizeof(status), "opened %s", entries[index].name);
    }
}

int main(int argc, char **argv)
{
    ui_window *window;
    char new_name[64] = "";

    ui_init();
    window = ui_window_open("Files", 560, 420, GUI_NORMAL);
    if (!window)
        return 1;

    if (argc > 1)
        strlcpy(path, argv[1], sizeof(path));
    reload();

    while (ui_begin(window)) {
        int activated;

        if (ui_key(window, GUI_KEY_ESCAPE))
            break;

        ui_clear(window, UI_BG);

        /* Path bar */
        ui_fill(window, 0, 0, window->width, 34, UI_PANEL);
        ui_text(window, 12, 9, path, UI_TEXT);
        ui_fill(window, 0, 34, window->width, 1, UI_BORDER);

        if (ui_button(window, window->width - 78, 5, 68, 24, "Up")) {
            enter_directory("..");
            window->dirty = 1;
        }

        /* Entry list */
        activated = ui_list(window, 10, 44, window->width - 20, window->height - 128,
                            names, entry_count, &selected, &scroll);
        if (activated >= 0)
            open_entry(activated);

        if (ui_key(window, GUI_KEY_ENTER))
            open_entry(selected);

        /* Actions */
        {
            int y = window->height - 74;

            ui_textbox(window, 10, y, 260, "name", new_name, sizeof(new_name));

            if (ui_button(window, 280, y, 90, 24, "New folder") && new_name[0]) {
                char full[192];

                snprintf(full, sizeof(full), "%s%s%s", path,
                         strcmp(path, "/") == 0 ? "" : "/", new_name);
                if (make_directory(full) == 0) {
                    new_name[0] = '\0';
                    reload();
                } else {
                    snprintf(status, sizeof(status), "could not create that folder");
                }
                window->dirty = 1;
            }

            if (ui_button(window, 378, y, 80, 24, "Open"))
                open_entry(selected);

            if (ui_button_colored(window, 466, y, 80, 24, "Delete", UI_BAD) &&
                selected >= 0 && selected < entry_count) {
                char full[192];

                snprintf(full, sizeof(full), "%s%s%s", path,
                         strcmp(path, "/") == 0 ? "" : "/", entries[selected].name);
                if (file_delete(full) == 0)
                    reload();
                else
                    snprintf(status, sizeof(status), "could not delete that");
                window->dirty = 1;
            }
        }

        /* Status bar */
        ui_fill(window, 0, window->height - 26, window->width, 26, UI_PANEL);
        ui_text(window, 12, window->height - 21, status, UI_TEXT_DIM);

        ui_end(window);
        ui_frame_wait();
    }

    ui_window_close(window);
    return 0;
}
