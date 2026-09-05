/*
 * Clock: an analogue face driven by the hardware clock, with the date below.
 */
#include "ui.h"

static const char *month_names[] = {
    "", "January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"
};

/* Cheap sine and cosine over degrees, good enough for clock hands. */
static double radians(double degrees)
{
    return degrees * 3.14159265358979 / 180.0;
}

static double sine(double x)
{
    double term = x;
    double sum = x;

    for (int i = 1; i < 8; i++) {
        term *= -x * x / ((2 * i) * (2 * i + 1));
        sum += term;
    }
    return sum;
}

static double cosine(double x)
{
    double term = 1;
    double sum = 1;

    for (int i = 1; i < 8; i++) {
        term *= -x * x / ((2 * i - 1) * (2 * i));
        sum += term;
    }
    return sum;
}

static void hand(ui_window *window, int cx, int cy, double degrees, int length,
                 int thickness, uint32_t color)
{
    double angle = radians(degrees - 90.0);
    int x = cx + (int)(cosine(angle) * length);
    int y = cy + (int)(sine(angle) * length);

    for (int offset = -thickness / 2; offset <= thickness / 2; offset++)
        ui_line(window, cx + offset, cy, x + offset, y, color);
}

int main(int argc, char **argv)
{
    ui_window *window;
    struct sys_time now;
    int last_second = -1;

    ui_init();
    window = ui_window_open("Clock", 320, 400, GUI_FIXED);
    if (!window)
        return 1;

    while (ui_begin(window)) {
        int cx = window->width / 2;
        int cy = 150;
        int radius = 120;
        char line[64];

        if (system_time(&now) < 0)
            break;

        if ((int)now.second != last_second) {
            last_second = (int)now.second;
            window->dirty = 1;
        }
        if (!window->dirty) {
            ui_end(window);
            ui_frame_wait();
            continue;
        }

        ui_clear(window, UI_BG);

        /* Face */
        ui_circle(window, cx, cy, radius, UI_RGB(0x1C, 0x24, 0x34));
        ui_circle(window, cx, cy, radius - 4, UI_RGB(0x26, 0x30, 0x44));

        for (int tick = 0; tick < 60; tick++) {
            double angle = radians(tick * 6.0 - 90.0);
            int outer = radius - 8;
            int inner = (tick % 5 == 0) ? radius - 20 : radius - 14;
            int x0 = cx + (int)(cosine(angle) * inner);
            int y0 = cy + (int)(sine(angle) * inner);
            int x1 = cx + (int)(cosine(angle) * outer);
            int y1 = cy + (int)(sine(angle) * outer);

            ui_line(window, x0, y0, x1, y1,
                    (tick % 5 == 0) ? UI_TEXT : UI_TEXT_DIM);
        }

        hand(window, cx, cy, ((int)now.hour % 12) * 30.0 + now.minute * 0.5,
             radius - 55, 5, UI_TEXT);
        hand(window, cx, cy, now.minute * 6.0 + now.second * 0.1,
             radius - 30, 3, UI_TEXT);
        hand(window, cx, cy, now.second * 6.0, radius - 22, 1, UI_BAD);
        ui_circle(window, cx, cy, 5, UI_ACCENT_LIGHT);

        /* Digital readout */
        snprintf(line, sizeof(line), "%02d:%02d:%02d",
                 (int)now.hour, (int)now.minute, (int)now.second);
        {
            int width = ui_text_width_scaled(line, 3);

            ui_text_scaled(window, (window->width - width) / 2, 292, line, UI_TEXT, 3);
        }

        snprintf(line, sizeof(line), "%d %s %d", (int)now.day,
                 month_names[(now.month >= 1 && now.month <= 12) ? now.month : 0],
                 (int)now.year);
        ui_text_center(window, 0, 344, window->width, line, UI_TEXT_DIM);

        {
            int seconds = uptime_ms() / 1000;

            snprintf(line, sizeof(line), "system up %d:%02d:%02d",
                     seconds / 3600, (seconds / 60) % 60, seconds % 60);
            ui_text_center(window, 0, 366, window->width, line, UI_TEXT_DIM);
        }

        ui_end(window);
        ui_frame_wait();
    }

    ui_window_close(window);
    return 0;
}
