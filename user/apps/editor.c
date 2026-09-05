/*
 * A text editor.
 *
 * Loads the file named on the command line, keeps it as an array of lines and
 * writes it back to disk on save, so edits survive a reboot.
 */
#include "ui.h"

#define MAX_LINES 512
#define MAX_COLS  200
#define GUTTER    52
#define TOP       36
#define BOTTOM    28

static char lines[MAX_LINES][MAX_COLS];
static int  line_count = 1;
static int  cursor_line, cursor_col;
static int  scroll_line;
static int  modified;
static char file_path[192];
static char status[128] = "new file";

static void load(const char *path)
{
    struct sys_stat info;
    char *buffer;
    int n, line = 0, column = 0;

    strlcpy(file_path, path, sizeof(file_path));
    memset(lines, 0, sizeof(lines));
    line_count = 1;

    if (file_stat(path, &info) < 0 || info.type != 1) {
        snprintf(status, sizeof(status), "new file: %s", path);
        return;
    }

    buffer = (char *)malloc(info.size + 1);
    if (!buffer)
        return;

    n = file_read(path, buffer, info.size);
    if (n < 0)
        n = 0;
    buffer[n] = '\0';

    for (int i = 0; i < n && line < MAX_LINES; i++) {
        if (buffer[i] == '\n') {
            line++;
            column = 0;
        } else if (buffer[i] == '\t') {
            for (int t = 0; t < 4 && column < MAX_COLS - 1; t++)
                lines[line][column++] = ' ';
        } else if (buffer[i] >= 32 && buffer[i] < 127 && column < MAX_COLS - 1) {
            lines[line][column++] = buffer[i];
        }
    }
    line_count = line + 1;
    free(buffer);

    snprintf(status, sizeof(status), "loaded %s, %d lines", path, line_count);
    modified = 0;
}

static void save(void)
{
    int total = 0;
    char *buffer;

    for (int i = 0; i < line_count; i++)
        total += (int)strlen(lines[i]) + 1;

    buffer = (char *)malloc(total + 1);
    if (!buffer) {
        snprintf(status, sizeof(status), "out of memory");
        return;
    }

    total = 0;
    for (int i = 0; i < line_count; i++) {
        int length = (int)strlen(lines[i]);

        memcpy(buffer + total, lines[i], length);
        total += length;
        buffer[total++] = '\n';
    }

    if (file_write(file_path, buffer, total) < 0)
        snprintf(status, sizeof(status), "could not write %s", file_path);
    else {
        snprintf(status, sizeof(status), "saved %s (%d bytes)", file_path, total);
        modified = 0;
    }
    free(buffer);
}

static void insert_char(char c)
{
    int length = (int)strlen(lines[cursor_line]);

    if (length >= MAX_COLS - 2)
        return;
    memmove(lines[cursor_line] + cursor_col + 1, lines[cursor_line] + cursor_col,
            length - cursor_col + 1);
    lines[cursor_line][cursor_col++] = c;
    modified = 1;
}

static void split_line(void)
{
    if (line_count >= MAX_LINES)
        return;

    for (int i = line_count; i > cursor_line + 1; i--)
        memcpy(lines[i], lines[i - 1], MAX_COLS);

    strlcpy(lines[cursor_line + 1], lines[cursor_line] + cursor_col, MAX_COLS);
    lines[cursor_line][cursor_col] = '\0';
    line_count++;
    cursor_line++;
    cursor_col = 0;
    modified = 1;
}

static void backspace(void)
{
    if (cursor_col > 0) {
        int length = (int)strlen(lines[cursor_line]);

        memmove(lines[cursor_line] + cursor_col - 1, lines[cursor_line] + cursor_col,
                length - cursor_col + 1);
        cursor_col--;
        modified = 1;
    } else if (cursor_line > 0) {
        int previous = (int)strlen(lines[cursor_line - 1]);

        if (previous + (int)strlen(lines[cursor_line]) < MAX_COLS - 1) {
            strcat(lines[cursor_line - 1], lines[cursor_line]);
            for (int i = cursor_line; i < line_count - 1; i++)
                memcpy(lines[i], lines[i + 1], MAX_COLS);
            memset(lines[line_count - 1], 0, MAX_COLS);
            line_count--;
            cursor_line--;
            cursor_col = previous;
            modified = 1;
        }
    }
}

static void handle_key(unsigned key)
{
    int length = (int)strlen(lines[cursor_line]);

    switch (key) {
    case GUI_KEY_ENTER:  split_line(); break;
    case GUI_KEY_BACK:   backspace(); break;
    case GUI_KEY_LEFT:
        if (cursor_col > 0)
            cursor_col--;
        else if (cursor_line > 0)
            cursor_col = (int)strlen(lines[--cursor_line]);
        break;
    case GUI_KEY_RIGHT:
        if (cursor_col < length)
            cursor_col++;
        else if (cursor_line < line_count - 1) {
            cursor_line++;
            cursor_col = 0;
        }
        break;
    case GUI_KEY_UP:
        if (cursor_line > 0) {
            cursor_line--;
            length = (int)strlen(lines[cursor_line]);
            if (cursor_col > length)
                cursor_col = length;
        }
        break;
    case GUI_KEY_DOWN:
        if (cursor_line < line_count - 1) {
            cursor_line++;
            length = (int)strlen(lines[cursor_line]);
            if (cursor_col > length)
                cursor_col = length;
        }
        break;
    case GUI_KEY_HOME: cursor_col = 0; break;
    case GUI_KEY_END:  cursor_col = length; break;
    case GUI_KEY_DELETE:
        if (cursor_col < length) {
            memmove(lines[cursor_line] + cursor_col, lines[cursor_line] + cursor_col + 1,
                    length - cursor_col);
            modified = 1;
        }
        break;
    case GUI_KEY_PGUP:
        cursor_line -= 10;
        if (cursor_line < 0)
            cursor_line = 0;
        break;
    case GUI_KEY_PGDN:
        cursor_line += 10;
        if (cursor_line >= line_count)
            cursor_line = line_count - 1;
        break;
    case 19:                        /* ^S */
        save();
        break;
    default:
        if (key >= 32 && key < 127)
            insert_char((char)key);
        break;
    }
}

int main(int argc, char **argv)
{
    ui_window *window;

    ui_init();
    window = ui_window_open("Text Editor", 700, 500, GUI_NORMAL);
    if (!window)
        return 1;

    if (argc > 1) {
        load(argv[1]);
        ui_set_title(window, argv[1]);
    } else {
        strlcpy(file_path, "/home/untitled.txt", sizeof(file_path));
    }

    while (ui_begin(window)) {
        int rows = (window->height - TOP - BOTTOM) / UI_GLYPH_H;

        for (int i = 0; i < window->key_count; i++)
            handle_key(window->keys[i]);

        if (window->wheel) {
            scroll_line -= window->wheel * 3;
            window->dirty = 1;
        }

        /* Keep the caret on screen. */
        if (cursor_line < scroll_line)
            scroll_line = cursor_line;
        if (cursor_line >= scroll_line + rows)
            scroll_line = cursor_line - rows + 1;
        if (scroll_line > line_count - 1)
            scroll_line = line_count - 1;
        if (scroll_line < 0)
            scroll_line = 0;

        /* Click to place the caret. */
        if (window->mouse_pressed && window->mouse_y > TOP &&
            window->mouse_y < window->height - BOTTOM) {
            int line = scroll_line + (window->mouse_y - TOP) / UI_GLYPH_H;
            int column = (window->mouse_x - GUTTER) / UI_GLYPH_W;

            if (line >= 0 && line < line_count) {
                int length = (int)strlen(lines[line]);

                cursor_line = line;
                cursor_col = (column < 0) ? 0 : (column > length ? length : column);
            }
        }

        ui_clear(window, 0xFF1A2030);

        /* Toolbar */
        ui_fill(window, 0, 0, window->width, TOP - 2, UI_PANEL);
        if (ui_button(window, 8, 5, 70, 24, "Save"))
            save();
        if (ui_button(window, 84, 5, 70, 24, "Reload"))
            load(file_path);
        ui_text(window, 168, 11, file_path, UI_TEXT);
        if (modified)
            ui_text(window, 168 + ui_text_width(file_path) + 10, 11, "*", UI_WARN);
        ui_fill(window, 0, TOP - 2, window->width, 1, UI_BORDER);

        /* Text with line numbers */
        for (int i = 0; i < rows && scroll_line + i < line_count; i++) {
            int line = scroll_line + i;
            int y = TOP + i * UI_GLYPH_H;
            char number[8];

            snprintf(number, sizeof(number), "%d", line + 1);
            ui_text(window, 10, y, number, UI_TEXT_DIM);

            if (line == cursor_line)
                ui_blend(window, GUTTER - 4, y, window->width - GUTTER, UI_GLYPH_H,
                         UI_RGBA(0x60, 0xA0, 0xF0, 24));
            ui_text(window, GUTTER, y, lines[line], UI_TEXT);
        }

        /* Caret */
        {
            int y = TOP + (cursor_line - scroll_line) * UI_GLYPH_H;

            if (y >= TOP && y < window->height - BOTTOM)
                ui_fill(window, GUTTER + cursor_col * UI_GLYPH_W, y, 2, UI_GLYPH_H,
                        UI_ACCENT_LIGHT);
        }

        /* Status bar */
        {
            char info[160];

            snprintf(info, sizeof(info), "line %d of %d, column %d   %s",
                     cursor_line + 1, line_count, cursor_col + 1, status);
            ui_fill(window, 0, window->height - BOTTOM, window->width, BOTTOM, UI_PANEL);
            ui_text(window, 10, window->height - BOTTOM + 6, info, UI_TEXT_DIM);
        }

        ui_end(window);
        ui_frame_wait();
    }

    ui_window_close(window);
    return 0;
}
