/*
 * Calculator.  Works with the mouse or the keyboard.
 */
#include "ui.h"

static double accumulator;
static double current;
static char   pending;
static int    fresh = 1;
static char   display[32] = "0";
static char   note[48] = "";

static void format(double value)
{
    long whole;
    long fraction;
    int  negative = value < 0;

    if (negative)
        value = -value;

    whole = (long)value;
    fraction = (long)((value - (double)whole) * 10000.0 + 0.5);
    if (fraction >= 10000) {
        whole++;
        fraction = 0;
    }

    if (fraction == 0)
        snprintf(display, sizeof(display), "%s%d", negative ? "-" : "", (int)whole);
    else {
        char decimals[8];

        snprintf(decimals, sizeof(decimals), "%04d", (int)fraction);
        /* trim trailing zeroes */
        for (int i = 3; i > 0 && decimals[i] == '0'; i--)
            decimals[i] = '\0';
        snprintf(display, sizeof(display), "%s%d.%s", negative ? "-" : "",
                 (int)whole, decimals);
    }
}

static double parse(const char *text)
{
    double value = 0;
    double scale = 0;
    int    negative = 0;

    if (*text == '-') {
        negative = 1;
        text++;
    }
    for (; *text; text++) {
        if (*text == '.') {
            scale = 0.1;
            continue;
        }
        if (*text < '0' || *text > '9')
            continue;
        if (scale == 0) {
            value = value * 10 + (*text - '0');
        } else {
            value += (*text - '0') * scale;
            scale /= 10;
        }
    }
    return negative ? -value : value;
}

static void apply(void)
{
    current = parse(display);

    switch (pending) {
    case '+': accumulator += current; break;
    case '-': accumulator -= current; break;
    case '*': accumulator *= current; break;
    case '/':
        if (current == 0) {
            strlcpy(note, "cannot divide by zero", sizeof(note));
            accumulator = 0;
        } else {
            accumulator /= current;
        }
        break;
    default:  accumulator = current; break;
    }
    format(accumulator);
}

static void digit(char c)
{
    int length = (int)strlen(display);

    if (fresh) {
        display[0] = '\0';
        length = 0;
        fresh = 0;
    }
    if (length >= 16)
        return;
    if (c == '.' && strchr(display, '.'))
        return;
    if (strcmp(display, "0") == 0 && c != '.')
        length = 0;

    display[length] = c;
    display[length + 1] = '\0';
}

static void operation(char op)
{
    note[0] = '\0';
    apply();
    pending = op;
    fresh = 1;
}

int main(int argc, char **argv)
{
    ui_window *window;
    static const char *labels[4][4] = {
        { "7", "8", "9", "/" },
        { "4", "5", "6", "*" },
        { "1", "2", "3", "-" },
        { "0", ".", "=", "+" },
    };

    ui_init();
    window = ui_window_open("Calculator", 260, 340, GUI_FIXED);
    if (!window)
        return 1;

    while (ui_begin(window)) {
        for (int i = 0; i < window->key_count; i++) {
            unsigned key = window->keys[i];

            if ((key >= '0' && key <= '9') || key == '.')
                digit((char)key);
            else if (key == '+' || key == '-' || key == '*' || key == '/')
                operation((char)key);
            else if (key == GUI_KEY_ENTER || key == '=')
                operation('=');
            else if (key == GUI_KEY_BACK) {
                int length = (int)strlen(display);

                if (length > 1)
                    display[length - 1] = '\0';
                else
                    strlcpy(display, "0", sizeof(display));
            } else if (key == GUI_KEY_ESCAPE || key == 'c' || key == 'C') {
                accumulator = current = 0;
                pending = 0;
                fresh = 1;
                strlcpy(display, "0", sizeof(display));
                note[0] = '\0';
            }
        }

        ui_clear(window, UI_BG);

        /* Display */
        ui_round_fill(window, 12, 12, window->width - 24, 60, 6, 0xFF11202A);
        ui_frame(window, 12, 12, window->width - 24, 60, UI_BORDER);
        {
            int width = ui_text_width_scaled(display, 2);

            ui_text_scaled(window, window->width - 24 - width, 32, display,
                           UI_RGB(0x90, 0xE8, 0xB0), 2);
            if (pending) {
                char op[2] = { pending, 0 };

                ui_text(window, 22, 20, op, UI_TEXT_DIM);
            }
        }

        /* Keypad */
        {
            int button_w = (window->width - 30) / 4;
            int button_h = 46;
            int top = 88;

            if (ui_button_colored(window, 12, top, button_w * 2 + 2, 32, "clear", UI_BAD)) {
                accumulator = current = 0;
                pending = 0;
                fresh = 1;
                strlcpy(display, "0", sizeof(display));
                note[0] = '\0';
            }
            top += 40;

            for (int row = 0; row < 4; row++) {
                for (int column = 0; column < 4; column++) {
                    const char *label = labels[row][column];
                    int x = 12 + column * (button_w + 2);
                    int y = top + row * (button_h + 2);
                    uint32_t color = (column == 3) ? UI_ACCENT :
                                     (label[0] == '=' ? UI_GOOD : UI_PANEL_LIGHT);

                    if (ui_button_colored(window, x, y, button_w, button_h, label, color)) {
                        char c = label[0];

                        if ((c >= '0' && c <= '9') || c == '.')
                            digit(c);
                        else
                            operation(c);
                    }
                }
            }
        }

        if (note[0])
            ui_text(window, 14, window->height - 20, note, UI_WARN);

        ui_end(window);
        ui_frame_wait();
    }

    ui_window_close(window);
    return 0;
}
