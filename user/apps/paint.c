/*
 * Paint: a drawing surface with a colour palette and brush sizes.
 */
#include "ui.h"

#define TOOLBAR 48
#define CANVAS_MAX (900 * 600)

static uint32_t canvas[CANVAS_MAX];
static int      canvas_w, canvas_h;
static uint32_t brush = 0xFFE8E8F0;
static int      size = 4;
static int      last_x = -1, last_y = -1;

static const uint32_t palette[] = {
    0xFFE8E8F0, 0xFF202832, 0xFFCC5548, 0xFFD8A038, 0xFF48B070,
    0xFF3C7AD0, 0xFF9868C8, 0xFF48B0C0, 0xFFE87890, 0xFF8A6440,
};

static void canvas_dot(int x, int y, int radius, uint32_t color)
{
    for (int dy = -radius; dy <= radius; dy++) {
        for (int dx = -radius; dx <= radius; dx++) {
            int px = x + dx, py = y + dy;

            if (dx * dx + dy * dy > radius * radius)
                continue;
            if (px < 0 || py < 0 || px >= canvas_w || py >= canvas_h)
                continue;
            canvas[py * canvas_w + px] = color;
        }
    }
}

static void canvas_line(int x0, int y0, int x1, int y1, int radius, uint32_t color)
{
    int dx = (x1 > x0) ? x1 - x0 : x0 - x1;
    int dy = (y1 > y0) ? y1 - y0 : y0 - y1;
    int sx = (x0 < x1) ? 1 : -1;
    int sy = (y0 < y1) ? 1 : -1;
    int err = dx - dy;

    for (;;) {
        canvas_dot(x0, y0, radius, color);
        if (x0 == x1 && y0 == y1)
            break;
        int e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx)  { err += dx; y0 += sy; }
    }
}

static void clear_canvas(void)
{
    for (int i = 0; i < canvas_w * canvas_h; i++)
        canvas[i] = 0xFF12171F;
}

int main(int argc, char **argv)
{
    ui_window *window;

    ui_init();
    window = ui_window_open("Paint", 720, 520, GUI_NORMAL);
    if (!window)
        return 1;

    canvas_w = window->width;
    canvas_h = window->height - TOOLBAR;
    if (canvas_w * canvas_h > CANVAS_MAX)
        canvas_h = CANVAS_MAX / canvas_w;
    clear_canvas();

    while (ui_begin(window)) {
        /* Drawing */
        if (window->mouse_down && window->mouse_y >= TOOLBAR) {
            int x = window->mouse_x;
            int y = window->mouse_y - TOOLBAR;

            if (last_x >= 0)
                canvas_line(last_x, last_y, x, y, size, brush);
            else
                canvas_dot(x, y, size, brush);
            last_x = x;
            last_y = y;
            window->dirty = 1;
        } else {
            last_x = last_y = -1;
        }

        if (!window->dirty) {
            ui_end(window);
            ui_frame_wait();
            continue;
        }

        /* Toolbar */
        ui_fill(window, 0, 0, window->width, TOOLBAR, UI_PANEL);
        ui_fill(window, 0, TOOLBAR - 1, window->width, 1, UI_BORDER);

        for (unsigned i = 0; i < sizeof(palette) / sizeof(palette[0]); i++) {
            int x = 10 + (int)i * 30;

            ui_round_fill(window, x, 10, 24, 24, 4, palette[i]);
            ui_frame(window, x, 10, 24, 24,
                     palette[i] == brush ? UI_WHITE : UI_BORDER);
            if (ui_hit(window, x, 10, 24, 24) && window->mouse_pressed)
                brush = palette[i];
        }

        {
            int x = 330;

            for (int i = 1; i <= 4; i++) {
                int radius = i * 3;

                if (ui_hit(window, x, 8, 28, 28) && window->mouse_pressed)
                    size = radius;
                ui_round_fill(window, x, 8, 28, 28, 4,
                              size == radius ? UI_ACCENT : UI_SURFACE);
                ui_circle(window, x + 14, 22, i * 2, UI_TEXT);
                x += 32;
            }
        }

        if (ui_button_colored(window, window->width - 90, 10, 78, 26, "Clear", UI_BAD))
            clear_canvas();

        /* Canvas */
        for (int y = 0; y < canvas_h; y++) {
            for (int x = 0; x < canvas_w; x++)
                ui_pixel(window, x, y + TOOLBAR, canvas[y * canvas_w + x]);
        }

        ui_end(window);
        ui_frame_wait();
    }

    ui_window_close(window);
    return 0;
}
