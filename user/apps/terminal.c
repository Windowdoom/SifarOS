/*
 * Terminal: a shell in a window.
 *
 * Keeps its own scrollback, draws it with the system font, and implements the
 * commands directly on top of the system call interface.
 */
#include "ui.h"

#define COLS       110
#define ROWS       400
#define PADDING    8
#define HISTORY    16
#define LINE_MAX   256

enum {
    COLOR_NORMAL = 0, COLOR_PROMPT, COLOR_ERROR, COLOR_DIM, COLOR_HEADING
};

static const uint32_t palette[] = {
    0xFFD8E0EC, 0xFF78D890, 0xFFE07868, 0xFF8895A8, 0xFF70B8F0,
};

static char    text[ROWS][COLS];
static uint8_t attr[ROWS][COLS];
static int     cursor_row, cursor_col;
static int     top_row;                 /* first row of the buffer in use */
static int     view_offset;             /* scrollback position */
static uint8_t current_color = COLOR_NORMAL;

static char    input[LINE_MAX];
static int     input_length, input_cursor;
static char    history[HISTORY][LINE_MAX];
static int     history_count, history_index;

static char    cwd[192] = "/";
static int     running = 1;

/* --------------------------------------------------------------- output */

static void scroll_up(void)
{
    for (int row = 0; row < ROWS - 1; row++) {
        memcpy(text[row], text[row + 1], COLS);
        memcpy(attr[row], attr[row + 1], COLS);
    }
    memset(text[ROWS - 1], 0, COLS);
    memset(attr[ROWS - 1], 0, COLS);
}

static void put_char(char c)
{
    if (c == '\n') {
        cursor_col = 0;
        cursor_row++;
    } else if (c == '\t') {
        cursor_col = (cursor_col + 4) & ~3;
    } else if (c >= 32 && c < 127) {
        if (cursor_col >= COLS - 1) {
            cursor_col = 0;
            cursor_row++;
        }
        if (cursor_row >= ROWS) {
            scroll_up();
            cursor_row = ROWS - 1;
        }
        text[cursor_row][cursor_col] = c;
        attr[cursor_row][cursor_col] = current_color;
        cursor_col++;
    }

    if (cursor_row >= ROWS) {
        scroll_up();
        cursor_row = ROWS - 1;
    }
    if (cursor_row > top_row)
        top_row = cursor_row;
}

static void term_write(const char *s)
{
    while (*s)
        put_char(*s++);
}

static void term_color(uint8_t color)
{
    current_color = color;
}

static void term_printf(const char *fmt, ...)
{
    char buffer[512];
    va_list ap;

    va_start(ap, fmt);
    {
        /* snprintf takes its own varargs, so format manually through it */
        char *out = buffer;
        size_t remaining = sizeof(buffer);
        const char *p = fmt;

        while (*p && remaining > 1) {
            if (*p != '%') {
                *out++ = *p++;
                remaining--;
                continue;
            }
            p++;
            switch (*p) {
            case 's': {
                const char *value = va_arg(ap, const char *);
                size_t length = strlen(value);

                if (length >= remaining)
                    length = remaining - 1;
                memcpy(out, value, length);
                out += length;
                remaining -= length;
                break;
            }
            case 'd': {
                char number[16];

                snprintf(number, sizeof(number), "%d", va_arg(ap, int));
                {
                    size_t length = strlen(number);

                    if (length >= remaining)
                        length = remaining - 1;
                    memcpy(out, number, length);
                    out += length;
                    remaining -= length;
                }
                break;
            }
            case 'u': {
                char number[16];

                snprintf(number, sizeof(number), "%u", va_arg(ap, unsigned int));
                {
                    size_t length = strlen(number);

                    if (length >= remaining)
                        length = remaining - 1;
                    memcpy(out, number, length);
                    out += length;
                    remaining -= length;
                }
                break;
            }
            case 'c':
                *out++ = (char)va_arg(ap, int);
                remaining--;
                break;
            default:
                *out++ = *p;
                remaining--;
                break;
            }
            p++;
        }
        *out = '\0';
    }
    va_end(ap);
    term_write(buffer);
}

/* -------------------------------------------------------------- commands */

static void resolve(const char *path, char *out, int size)
{
    if (!path || !path[0]) {
        strlcpy(out, cwd, size);
        return;
    }
    if (path[0] == '/') {
        strlcpy(out, path, size);
        return;
    }
    if (strcmp(cwd, "/") == 0)
        snprintf(out, size, "/%s", path);
    else
        snprintf(out, size, "%s/%s", cwd, path);
}

static void command_ls(int argc, char **argv)
{
    struct sys_dirent entries[64];
    char path[192];
    int count;

    resolve(argc > 1 ? argv[1] : NULL, path, sizeof(path));
    count = list_directory(path, entries, 64);
    if (count < 0) {
        term_color(COLOR_ERROR);
        term_printf("ls: cannot read %s\n", path);
        term_color(COLOR_NORMAL);
        return;
    }

    for (int i = 0; i < count; i++) {
        if (entries[i].type == 2) {
            term_color(COLOR_HEADING);
            term_printf("  %s/\n", entries[i].name);
            term_color(COLOR_NORMAL);
        } else {
            term_printf("  %s", entries[i].name);
            for (int pad = (int)strlen(entries[i].name); pad < 24; pad++)
                put_char(' ');
            term_color(COLOR_DIM);
            term_printf("%u bytes\n", entries[i].size);
            term_color(COLOR_NORMAL);
        }
    }
    if (count == 0)
        term_write("  (empty)\n");
}

static void command_cat(int argc, char **argv)
{
    char path[192];
    char *buffer;
    struct sys_stat info;
    int n;

    if (argc < 2) {
        term_write("usage: cat <file>\n");
        return;
    }
    resolve(argv[1], path, sizeof(path));
    if (file_stat(path, &info) < 0 || info.type != 1) {
        term_color(COLOR_ERROR);
        term_printf("cat: no such file: %s\n", path);
        term_color(COLOR_NORMAL);
        return;
    }

    buffer = (char *)malloc(info.size + 1);
    if (!buffer)
        return;
    n = file_read(path, buffer, info.size);
    if (n > 0) {
        buffer[n] = '\0';
        term_write(buffer);
        if (n > 0 && buffer[n - 1] != '\n')
            put_char('\n');
    }
    free(buffer);
}

static void command_write(int argc, char **argv, int append)
{
    char path[192];
    char line[LINE_MAX];

    if (argc < 3) {
        term_printf("usage: %s <file> <text...>\n", argv[0]);
        return;
    }
    resolve(argv[1], path, sizeof(path));

    line[0] = '\0';
    for (int i = 2; i < argc; i++) {
        strcat(line, argv[i]);
        if (i + 1 < argc)
            strcat(line, " ");
    }
    strcat(line, "\n");

    if ((append ? file_append(path, line, strlen(line))
                : file_write(path, line, strlen(line))) < 0) {
        term_color(COLOR_ERROR);
        term_printf("%s: cannot write %s\n", argv[0], path);
        term_color(COLOR_NORMAL);
    }
}

static void command_ps(void)
{
    struct sys_proc list[32];
    int count = process_list(list, 32);

    term_color(COLOR_HEADING);
    term_write("  PID  PPID  MEMORY   STATE     NAME\n");
    term_color(COLOR_NORMAL);
    for (int i = 0; i < count; i++) {
        term_printf("  %d", (int)list[i].pid);
        for (int pad = 0; pad < 5; pad++)
            put_char(' ');
        term_printf("%d     %u KiB", (int)list[i].parent, list[i].memory_kb);
        for (int pad = 0; pad < 4; pad++)
            put_char(' ');
        term_printf("%s   %s\n",
                    list[i].state == 1 ? "running" : "zombie ", list[i].name);
    }
}

static void command_mem(void)
{
    struct sys_info info;

    if (system_info(&info) < 0)
        return;

    term_printf("memory : %u MiB total, %u MiB used, %u MiB free\n",
                info.total_memory_kb / 1024, info.used_memory_kb / 1024,
                (info.total_memory_kb - info.used_memory_kb) / 1024);
    term_printf("heap   : %u KiB used of %u KiB mapped\n",
                info.heap_used_kb, info.heap_total_kb);
    term_printf("disk   : %u MiB total, %u MiB free\n",
                info.disk_total_kb / 1024, info.disk_free_kb / 1024);
    term_printf("system : %u processes, %u threads, screen %ux%u\n",
                info.processes, info.threads, info.screen_width, info.screen_height);
    term_printf("cpu    : %s\n", info.cpu);
}

static void command_help(void)
{
    term_color(COLOR_HEADING);
    term_write("commands\n");
    term_color(COLOR_NORMAL);
    term_write("  ls [path]           list a directory\n"
               "  cd <path>           change directory\n"
               "  pwd                 print the working directory\n"
               "  cat <file>          show a file\n"
               "  write <file> <text> replace a file\n"
               "  append <file> <text>add a line to a file\n"
               "  rm <path>           delete a file or directory\n"
               "  mkdir <path>        create a directory\n"
               "  run <app> [args]    start an application\n"
               "  ps                  list processes\n"
               "  kill <pid>          stop a process\n"
               "  mem                 memory and disk usage\n"
               "  date                the hardware clock\n"
               "  uptime              time since boot\n"
               "  dmesg               the kernel boot log\n"
               "  clear               clear the screen\n"
               "  reboot / shutdown   leave\n"
               "  exit                close this window\n");
}

static void run_command(char *line)
{
    char *argv[16];
    int argc = 0;
    char *p = line;

    while (*p && argc < 16) {
        while (*p == ' ')
            p++;
        if (!*p)
            break;
        argv[argc++] = p;
        while (*p && *p != ' ')
            p++;
        if (*p)
            *p++ = '\0';
    }
    if (argc == 0)
        return;

    if (strcmp(argv[0], "help") == 0) {
        command_help();
    } else if (strcmp(argv[0], "ls") == 0) {
        command_ls(argc, argv);
    } else if (strcmp(argv[0], "cd") == 0) {
        char path[192];

        resolve(argc > 1 ? argv[1] : "/", path, sizeof(path));
        if (change_directory(path) < 0) {
            term_color(COLOR_ERROR);
            term_printf("cd: no such directory: %s\n", path);
            term_color(COLOR_NORMAL);
        } else {
            working_directory(cwd, sizeof(cwd));
        }
    } else if (strcmp(argv[0], "pwd") == 0) {
        term_printf("%s\n", cwd);
    } else if (strcmp(argv[0], "cat") == 0) {
        command_cat(argc, argv);
    } else if (strcmp(argv[0], "write") == 0) {
        command_write(argc, argv, 0);
    } else if (strcmp(argv[0], "append") == 0) {
        command_write(argc, argv, 1);
    } else if (strcmp(argv[0], "rm") == 0) {
        char path[192];

        if (argc < 2) {
            term_write("usage: rm <path>\n");
        } else {
            resolve(argv[1], path, sizeof(path));
            if (file_delete(path) < 0) {
                term_color(COLOR_ERROR);
                term_printf("rm: cannot remove %s\n", path);
                term_color(COLOR_NORMAL);
            }
        }
    } else if (strcmp(argv[0], "mkdir") == 0) {
        char path[192];

        if (argc < 2) {
            term_write("usage: mkdir <path>\n");
        } else {
            resolve(argv[1], path, sizeof(path));
            if (make_directory(path) < 0) {
                term_color(COLOR_ERROR);
                term_printf("mkdir: cannot create %s\n", path);
                term_color(COLOR_NORMAL);
            }
        }
    } else if (strcmp(argv[0], "run") == 0) {
        char path[192];
        int pid;

        if (argc < 2) {
            term_write("usage: run <application>\n");
        } else {
            if (argv[1][0] == '/')
                strlcpy(path, argv[1], sizeof(path));
            else
                snprintf(path, sizeof(path), "/apps/%s", argv[1]);

            pid = spawn(path, argc - 1, (const char *const *)&argv[1]);
            if (pid < 0) {
                term_color(COLOR_ERROR);
                term_printf("run: cannot start %s\n", path);
                term_color(COLOR_NORMAL);
            } else {
                term_color(COLOR_DIM);
                term_printf("started %s as process %d\n", path, pid);
                term_color(COLOR_NORMAL);
            }
        }
    } else if (strcmp(argv[0], "ps") == 0) {
        command_ps();
    } else if (strcmp(argv[0], "kill") == 0) {
        if (argc < 2)
            term_write("usage: kill <pid>\n");
        else if (kill_process(atoi(argv[1])) < 0)
            term_write("kill: no such process\n");
    } else if (strcmp(argv[0], "mem") == 0) {
        command_mem();
    } else if (strcmp(argv[0], "date") == 0) {
        struct sys_time now;

        if (system_time(&now) == 0)
            term_printf("%u-%u-%u %u:%u:%u\n", now.year, now.month, now.day,
                        now.hour, now.minute, now.second);
    } else if (strcmp(argv[0], "uptime") == 0) {
        int seconds = uptime_ms() / 1000;

        term_printf("up %d:%d:%d\n", seconds / 3600, (seconds / 60) % 60,
                    seconds % 60);
    } else if (strcmp(argv[0], "dmesg") == 0) {
        char *buffer = (char *)malloc(16 * 1024);

        if (buffer) {
            int n = kernel_log(buffer, 16 * 1024 - 1);

            if (n > 0) {
                buffer[n] = '\0';
                term_write(buffer);
            }
            free(buffer);
        }
    } else if (strcmp(argv[0], "clear") == 0) {
        memset(text, 0, sizeof(text));
        memset(attr, 0, sizeof(attr));
        cursor_row = cursor_col = 0;
        top_row = 0;
    } else if (strcmp(argv[0], "reboot") == 0) {
        reboot();
    } else if (strcmp(argv[0], "shutdown") == 0) {
        shutdown();
    } else if (strcmp(argv[0], "exit") == 0) {
        running = 0;
    } else {
        term_color(COLOR_ERROR);
        term_printf("%s: command not found\n", argv[0]);
        term_color(COLOR_NORMAL);
    }
}

/* ---------------------------------------------------------------- input */

static void submit(void)
{
    char line[LINE_MAX];

    input[input_length] = '\0';
    strlcpy(line, input, sizeof(line));

    term_color(COLOR_PROMPT);
    term_printf("%s$ ", cwd);
    term_color(COLOR_NORMAL);
    term_printf("%s\n", input);

    if (input_length > 0) {
        if (history_count == HISTORY) {
            for (int i = 1; i < HISTORY; i++)
                strlcpy(history[i - 1], history[i], LINE_MAX);
            history_count--;
        }
        strlcpy(history[history_count++], input, LINE_MAX);
    }
    history_index = history_count;

    input_length = input_cursor = 0;
    input[0] = '\0';
    view_offset = 0;

    run_command(line);
}

static void handle_key(unsigned key)
{
    switch (key) {
    case GUI_KEY_ENTER:
        submit();
        break;
    case GUI_KEY_BACK:
        if (input_cursor > 0) {
            memmove(input + input_cursor - 1, input + input_cursor,
                    input_length - input_cursor);
            input_cursor--;
            input_length--;
            input[input_length] = '\0';
        }
        break;
    case GUI_KEY_LEFT:
        if (input_cursor > 0)
            input_cursor--;
        break;
    case GUI_KEY_RIGHT:
        if (input_cursor < input_length)
            input_cursor++;
        break;
    case GUI_KEY_HOME:
        input_cursor = 0;
        break;
    case GUI_KEY_END:
        input_cursor = input_length;
        break;
    case GUI_KEY_UP:
        if (history_index > 0) {
            history_index--;
            strlcpy(input, history[history_index], LINE_MAX);
            input_length = input_cursor = (int)strlen(input);
        }
        break;
    case GUI_KEY_DOWN:
        if (history_index < history_count - 1) {
            history_index++;
            strlcpy(input, history[history_index], LINE_MAX);
            input_length = input_cursor = (int)strlen(input);
        } else {
            history_index = history_count;
            input[0] = '\0';
            input_length = input_cursor = 0;
        }
        break;
    case GUI_KEY_PGUP:
        view_offset += 8;
        break;
    case GUI_KEY_PGDN:
        view_offset -= 8;
        if (view_offset < 0)
            view_offset = 0;
        break;
    default:
        if (key >= 32 && key < 127 && input_length < LINE_MAX - 1) {
            memmove(input + input_cursor + 1, input + input_cursor,
                    input_length - input_cursor);
            input[input_cursor++] = (char)key;
            input_length++;
            input[input_length] = '\0';
        }
        break;
    }
}

/* ---------------------------------------------------------------- render */

static void draw(ui_window *window)
{
    int rows = (window->height - PADDING * 2) / UI_GLYPH_H;
    int first;
    int y = PADDING;

    ui_clear(window, 0xFF141A24);
    ui_fill(window, 0, 0, window->width, 2, 0xFF1E2938);

    /* One line is reserved at the bottom for the prompt. */
    rows -= 1;
    first = cursor_row - rows + 1 - view_offset;
    if (first < 0)
        first = 0;

    for (int i = 0; i < rows; i++) {
        int row = first + i;

        if (row > top_row)
            break;
        for (int col = 0; col < COLS; col++) {
            char c = text[row][col];
            char single[2];

            if (!c)
                break;
            single[0] = c;
            single[1] = '\0';
            ui_text(window, PADDING + col * UI_GLYPH_W, y + i * UI_GLYPH_H,
                    single, palette[attr[row][col] % 5]);
        }
    }

    /* Prompt line */
    {
        int prompt_y = PADDING + rows * UI_GLYPH_H;
        int x = PADDING;
        char prompt[200];

        snprintf(prompt, sizeof(prompt), "%s$ ", cwd);
        ui_text(window, x, prompt_y, prompt, palette[COLOR_PROMPT]);
        x += ui_text_width(prompt);
        ui_text(window, x, prompt_y, input, palette[COLOR_NORMAL]);

        if (view_offset == 0) {
            int caret = x + input_cursor * UI_GLYPH_W;

            if ((uptime_ms() / 500) % 2 == 0 || window->focused)
                ui_fill(window, caret, prompt_y, 2, UI_GLYPH_H, 0xFF70B8F0);
        }
    }

    if (view_offset > 0) {
        char note[48];

        snprintf(note, sizeof(note), "scrolled back %d lines", view_offset);
        ui_fill(window, window->width - 220, 4, 212, 18, 0xFF283244);
        ui_text(window, window->width - 212, 5, note, palette[COLOR_DIM]);
    }
}

int main(int argc, char **argv)
{
    ui_window *window;
    int last_blink = 0;

    ui_init();
    window = ui_window_open("Terminal", 720, 460, GUI_NORMAL);
    if (!window)
        return 1;

    working_directory(cwd, sizeof(cwd));

    term_color(COLOR_HEADING);
    term_write("SifarOS terminal\n");
    term_color(COLOR_DIM);
    term_write("type 'help' for the command list\n\n");
    term_color(COLOR_NORMAL);

    while (running && ui_begin(window)) {
        for (int i = 0; i < window->key_count; i++)
            handle_key(window->keys[i]);

        if (window->wheel) {
            view_offset += window->wheel * 3;
            if (view_offset < 0)
                view_offset = 0;
        }

        /* Repaint for the caret blink even when nothing else changed. */
        if (uptime_ms() - last_blink > 500) {
            last_blink = uptime_ms();
            window->dirty = 1;
        }

        if (window->dirty)
            draw(window);
        ui_end(window);
        ui_frame_wait();
    }

    ui_window_close(window);
    return 0;
}
