/*
 * Toolkit implementation.
 *
 * Drawing happens straight into the window's pixel buffer, which the kernel
 * mapped into this process.  Nothing here is a system call except opening the
 * window, reading events and telling the server which region changed.
 */
#include "ui.h"

static uint8_t font[4096];
static int     font_loaded;

int ui_init(void)
{
    if (font_loaded)
        return 0;
    if (syscall3(SYS_FONT, (int)font, sizeof(font), 0) <= 0)
        return -1;
    font_loaded = 1;
    return 0;
}

/* ------------------------------------------------------------- lifecycle */

ui_window *ui_window_open(const char *title, int width, int height, unsigned flags)
{
    ui_window *window;
    struct gui_window_info info;
    int id;

    ui_init();

    window = (ui_window *)calloc(1, sizeof(*window));
    if (!window)
        return NULL;

    /* The flags ride in the top half of the width argument. */
    id = syscall3(SYS_GUI_CREATE, (int)((flags << 16) | (unsigned)width),
                  height, (int)title);
    if (id < 0) {
        free(window);
        return NULL;
    }

    if (syscall3(SYS_GUI_INFO, id, (int)&info, 0) < 0) {
        syscall3(SYS_GUI_DESTROY, id, 0, 0);
        free(window);
        return NULL;
    }

    window->id = id;
    window->width = (int)info.width;
    window->height = (int)info.height;
    window->surface.pixels = (uint32_t *)info.buffer;
    window->surface.width = (int)info.width;
    window->surface.height = (int)info.height;
    window->surface.stride = (int)info.stride;
    window->dirty = 1;
    ui_clip_reset(window);
    return window;
}

void ui_window_close(ui_window *window)
{
    if (!window)
        return;
    syscall3(SYS_GUI_DESTROY, window->id, 0, 0);
    free(window);
}

void ui_set_title(ui_window *window, const char *title)
{
    syscall3(SYS_GUI_TITLE, window->id, (int)title, 0);
}

void ui_move(ui_window *window, int x, int y)
{
    syscall3(SYS_GUI_MOVE, window->id, x, y);
}

void ui_resize(ui_window *window, int width, int height)
{
    struct gui_window_info info;

    if (syscall3(SYS_GUI_RESIZE, window->id, width, height) < 0)
        return;
    if (syscall3(SYS_GUI_INFO, window->id, (int)&info, 0) < 0)
        return;

    window->width = (int)info.width;
    window->height = (int)info.height;
    window->surface.pixels = (uint32_t *)info.buffer;
    window->surface.width = (int)info.width;
    window->surface.height = (int)info.height;
    window->surface.stride = (int)info.stride;
    ui_clip_reset(window);
    window->dirty = 1;
}

int ui_screen_size(int *width, int *height)
{
    struct gui_screen_info info;

    if (syscall3(SYS_GUI_SCREEN, (int)&info, 0, 0) < 0)
        return -1;
    if (width)
        *width = (int)info.width;
    if (height)
        *height = (int)info.height;
    return 0;
}

void ui_redraw(ui_window *window)
{
    window->dirty = 1;
}

int ui_begin(ui_window *window)
{
    struct gui_event event;
    struct gui_window_info info;

    window->mouse_pressed = 0;
    window->mouse_released = 0;
    window->wheel = 0;
    window->key_count = 0;
    window->widget_counter = 0;

    while (syscall3(SYS_GUI_POLL, window->id, (int)&event, 0) == 1) {
        switch (event.type) {
        case GUI_EVENT_MOUSE_MOVE:
            window->mouse_x = event.x;
            window->mouse_y = event.y;
            break;
        case GUI_EVENT_MOUSE_DOWN:
            window->mouse_x = event.x;
            window->mouse_y = event.y;
            window->mouse_down = 1;
            window->mouse_pressed = 1;
            window->dirty = 1;
            break;
        case GUI_EVENT_MOUSE_UP:
            window->mouse_x = event.x;
            window->mouse_y = event.y;
            window->mouse_down = 0;
            window->mouse_released = 1;
            window->dirty = 1;
            break;
        case GUI_EVENT_WHEEL:
            window->wheel += event.wheel;
            window->dirty = 1;
            break;
        case GUI_EVENT_KEY:
            if (window->key_count < 8)
                window->keys[window->key_count++] = event.key;
            window->dirty = 1;
            break;
        case GUI_EVENT_CLOSE:
            window->closed = 1;
            break;
        case GUI_EVENT_FOCUS:
            window->focused = 1;
            window->dirty = 1;
            break;
        case GUI_EVENT_BLUR:
            window->focused = 0;
            window->dirty = 1;
            break;
        case GUI_EVENT_RESIZE:
            if (syscall3(SYS_GUI_INFO, window->id, (int)&info, 0) == 0) {
                window->width = (int)info.width;
                window->height = (int)info.height;
                window->surface.pixels = (uint32_t *)info.buffer;
                window->surface.width = (int)info.width;
                window->surface.height = (int)info.height;
                window->surface.stride = (int)info.stride;
                ui_clip_reset(window);
            }
            window->dirty = 1;
            break;
        default:
            break;
        }
    }

    return !window->closed;
}

void ui_end(ui_window *window)
{
    if (window->dirty) {
        syscall3(SYS_GUI_INVALIDATE, window->id, 0, 0);
        window->dirty = 0;
    }
}

/* Pace a redraw loop.  Applications that drive several windows call this once
   per pass rather than after every window. */
void ui_frame_wait(void)
{
    sleep_ms(16);
}

int ui_key(ui_window *window, unsigned key)
{
    for (int i = 0; i < window->key_count; i++) {
        if (window->keys[i] == key)
            return 1;
    }
    return 0;
}

/* --------------------------------------------------------------- drawing */

void ui_clip_reset(ui_window *window)
{
    window->surface.clip.x = 0;
    window->surface.clip.y = 0;
    window->surface.clip.w = window->surface.width;
    window->surface.clip.h = window->surface.height;
}

void ui_clip_set(ui_window *window, int x, int y, int w, int h)
{
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > window->surface.width)  w = window->surface.width - x;
    if (y + h > window->surface.height) h = window->surface.height - y;

    window->surface.clip.x = x;
    window->surface.clip.y = y;
    window->surface.clip.w = (w < 0) ? 0 : w;
    window->surface.clip.h = (h < 0) ? 0 : h;
}

static int clamp_rect(ui_window *window, int *x, int *y, int *w, int *h)
{
    ui_rect *clip = &window->surface.clip;
    int x1 = clip->x + clip->w, y1 = clip->y + clip->h;

    if (*x < clip->x) { *w -= clip->x - *x; *x = clip->x; }
    if (*y < clip->y) { *h -= clip->y - *y; *y = clip->y; }
    if (*x + *w > x1) *w = x1 - *x;
    if (*y + *h > y1) *h = y1 - *y;
    return (*w > 0 && *h > 0);
}

void ui_pixel(ui_window *window, int x, int y, uint32_t color)
{
    ui_rect *clip = &window->surface.clip;

    if (x < clip->x || y < clip->y || x >= clip->x + clip->w || y >= clip->y + clip->h)
        return;
    window->surface.pixels[y * window->surface.stride + x] = color;
}

void ui_fill(ui_window *window, int x, int y, int w, int h, uint32_t color)
{
    if (!clamp_rect(window, &x, &y, &w, &h))
        return;

    for (int row = 0; row < h; row++) {
        uint32_t *line = window->surface.pixels + (y + row) * window->surface.stride + x;

        for (int col = 0; col < w; col++)
            line[col] = color;
    }
    window->dirty = 1;
}

void ui_blend(ui_window *window, int x, int y, int w, int h, uint32_t color)
{
    uint32_t alpha = (color >> 24) & 0xFF;

    if (alpha == 255) {
        ui_fill(window, x, y, w, h, color);
        return;
    }
    if (!alpha || !clamp_rect(window, &x, &y, &w, &h))
        return;

    for (int row = 0; row < h; row++) {
        uint32_t *line = window->surface.pixels + (y + row) * window->surface.stride + x;

        for (int col = 0; col < w; col++) {
            uint32_t dst = line[col];
            uint32_t r = ((((color >> 16) & 0xFF) * alpha) + (((dst >> 16) & 0xFF) * (255 - alpha))) / 255;
            uint32_t g = ((((color >> 8) & 0xFF) * alpha) + (((dst >> 8) & 0xFF) * (255 - alpha))) / 255;
            uint32_t b = (((color & 0xFF) * alpha) + ((dst & 0xFF) * (255 - alpha))) / 255;

            line[col] = 0xFF000000u | (r << 16) | (g << 8) | b;
        }
    }
    window->dirty = 1;
}

void ui_clear(ui_window *window, uint32_t color)
{
    ui_fill(window, 0, 0, window->width, window->height, color);
}

void ui_frame(ui_window *window, int x, int y, int w, int h, uint32_t color)
{
    ui_fill(window, x, y, w, 1, color);
    ui_fill(window, x, y + h - 1, w, 1, color);
    ui_fill(window, x, y, 1, h, color);
    ui_fill(window, x + w - 1, y, 1, h, color);
}

void ui_round_fill(ui_window *window, int x, int y, int w, int h, int radius, uint32_t color)
{
    if (radius * 2 > w) radius = w / 2;
    if (radius * 2 > h) radius = h / 2;
    if (radius <= 0) {
        ui_fill(window, x, y, w, h, color);
        return;
    }

    ui_fill(window, x + radius, y, w - 2 * radius, h, color);
    ui_fill(window, x, y + radius, radius, h - 2 * radius, color);
    ui_fill(window, x + w - radius, y + radius, radius, h - 2 * radius, color);

    for (int dy = 0; dy < radius; dy++) {
        int dx = 0;

        while (dx < radius &&
               (radius - dy) * (radius - dy) + (radius - dx - 1) * (radius - dx - 1) >
               radius * radius)
            dx++;
        ui_fill(window, x + dx, y + dy, w - 2 * dx, 1, color);
        ui_fill(window, x + dx, y + h - 1 - dy, w - 2 * dx, 1, color);
    }
}

void ui_gradient(ui_window *window, int x, int y, int w, int h, uint32_t top, uint32_t bottom)
{
    if (h <= 0)
        return;

    for (int row = 0; row < h; row++) {
        int divisor = (h > 1) ? h - 1 : 1;
        uint32_t r = ((((top >> 16) & 0xFF) * (h - 1 - row)) + (((bottom >> 16) & 0xFF) * row)) / divisor;
        uint32_t g = ((((top >> 8) & 0xFF) * (h - 1 - row)) + (((bottom >> 8) & 0xFF) * row)) / divisor;
        uint32_t b = (((top & 0xFF) * (h - 1 - row)) + ((bottom & 0xFF) * row)) / divisor;

        ui_fill(window, x, y + row, w, 1, 0xFF000000u | (r << 16) | (g << 8) | b);
    }
}

void ui_line(ui_window *window, int x0, int y0, int x1, int y1, uint32_t color)
{
    int dx = (x1 > x0) ? x1 - x0 : x0 - x1;
    int dy = (y1 > y0) ? y1 - y0 : y0 - y1;
    int sx = (x0 < x1) ? 1 : -1;
    int sy = (y0 < y1) ? 1 : -1;
    int err = dx - dy;

    for (;;) {
        ui_pixel(window, x0, y0, color);
        if (x0 == x1 && y0 == y1)
            break;
        int e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx)  { err += dx; y0 += sy; }
    }
    window->dirty = 1;
}

void ui_circle(ui_window *window, int cx, int cy, int radius, uint32_t color)
{
    for (int dy = -radius; dy <= radius; dy++) {
        int span = 0;

        while ((span + 1) * (span + 1) + dy * dy <= radius * radius)
            span++;
        ui_fill(window, cx - span, cy + dy, span * 2 + 1, 1, color);
    }
}

void ui_text_scaled(ui_window *window, int x, int y, const char *text, uint32_t color, int scale)
{
    if (scale < 1)
        scale = 1;

    for (; *text; text++) {
        const uint8_t *glyph = font + ((unsigned char)*text * UI_GLYPH_H);

        if (*text == '\n') {
            y += UI_GLYPH_H * scale;
            continue;
        }
        for (int row = 0; row < UI_GLYPH_H; row++) {
            uint8_t bits = glyph[row];

            for (int col = 0; col < UI_GLYPH_W; col++) {
                if (!(bits & (0x80 >> col)))
                    continue;
                if (scale == 1)
                    ui_pixel(window, x + col, y + row, color);
                else
                    ui_fill(window, x + col * scale, y + row * scale, scale, scale, color);
            }
        }
        x += UI_GLYPH_W * scale;
    }
    window->dirty = 1;
}

void ui_text(ui_window *window, int x, int y, const char *text, uint32_t color)
{
    ui_text_scaled(window, x, y, text, color, 1);
}

void ui_text_center(ui_window *window, int x, int y, int w, const char *text, uint32_t color)
{
    int width = ui_text_width(text);

    ui_text(window, x + (w - width) / 2, y, text, color);
}

int ui_text_width(const char *text)
{
    return (int)strlen(text) * UI_GLYPH_W;
}

int ui_text_width_scaled(const char *text, int scale)
{
    return (int)strlen(text) * UI_GLYPH_W * scale;
}

/* --------------------------------------------------------------- widgets */

int ui_hit(ui_window *window, int x, int y, int w, int h)
{
    return window->mouse_x >= x && window->mouse_x < x + w &&
           window->mouse_y >= y && window->mouse_y < y + h;
}

int ui_button_colored(ui_window *window, int x, int y, int w, int h,
                      const char *label, uint32_t color)
{
    int id = ++window->widget_counter;
    int hover = ui_hit(window, x, y, w, h);
    int clicked = 0;
    uint32_t face = color;

    if (hover && window->mouse_pressed) {
        window->active = id;
        window->focus = id;
    }
    if (window->active == id && window->mouse_released) {
        if (hover)
            clicked = 1;
        window->active = 0;
    }

    if (window->active == id && hover)
        face = UI_RGBA((color >> 16) & 0xFF, (color >> 8) & 0xFF, color & 0xFF, 255) & 0xFF9F9F9Fu;
    else if (hover)
        face = color + 0x00101010u;

    ui_round_fill(window, x, y, w, h, 4, face);
    ui_frame(window, x, y, w, h, UI_BORDER);
    ui_text_center(window, x, y + (h - UI_GLYPH_H) / 2, w, label, UI_TEXT);
    return clicked;
}

int ui_button(ui_window *window, int x, int y, int w, int h, const char *label)
{
    return ui_button_colored(window, x, y, w, h, label, UI_PANEL_LIGHT);
}

int ui_toggle(ui_window *window, int x, int y, const char *label, int *value)
{
    int box = 16;
    int width = box + 8 + ui_text_width(label);
    int changed = 0;

    if (ui_hit(window, x, y, width, box) && window->mouse_pressed) {
        *value = !*value;
        changed = 1;
        window->dirty = 1;
    }

    ui_round_fill(window, x, y, box, box, 3, *value ? UI_ACCENT : UI_SURFACE);
    ui_frame(window, x, y, box, box, UI_BORDER);
    if (*value) {
        ui_line(window, x + 4, y + 8, x + 7, y + 11, UI_WHITE);
        ui_line(window, x + 7, y + 11, x + 12, y + 4, UI_WHITE);
    }
    ui_text(window, x + box + 8, y + 1, label, UI_TEXT);
    return changed;
}

/* Single line text entry.  Returns 1 when the user presses enter. */
int ui_textbox(ui_window *window, int x, int y, int w, const char *label,
               char *text, int capacity)
{
    int id = ++window->widget_counter;
    int height = 24;
    int label_width = label ? ui_text_width(label) + 8 : 0;
    int submitted = 0;
    int length = (int)strlen(text);

    if (label)
        ui_text(window, x, y + 4, label, UI_TEXT_DIM);

    x += label_width;
    w -= label_width;

    if (ui_hit(window, x, y, w, height) && window->mouse_pressed)
        window->focus = id;

    if (window->focus == id) {
        for (int i = 0; i < window->key_count; i++) {
            unsigned key = window->keys[i];

            if (key == GUI_KEY_BACK) {
                if (length > 0)
                    text[--length] = '\0';
            } else if (key == GUI_KEY_ENTER) {
                submitted = 1;
            } else if (key >= 32 && key < 127 && length < capacity - 1) {
                text[length++] = (char)key;
                text[length] = '\0';
            }
        }
    }

    ui_fill(window, x, y, w, height, UI_SURFACE);
    ui_frame(window, x, y, w, height, window->focus == id ? UI_ACCENT : UI_BORDER);
    ui_clip_set(window, x + 4, y, w - 8, height);
    {
        int text_width = ui_text_width(text);
        int offset = (text_width > w - 12) ? text_width - (w - 12) : 0;

        ui_text(window, x + 5 - offset, y + 4, text, UI_TEXT);
        if (window->focus == id)
            ui_fill(window, x + 6 - offset + text_width, y + 4, 2, UI_GLYPH_H, UI_ACCENT_LIGHT);
    }
    ui_clip_reset(window);
    return submitted;
}

/*
 * Scrollable list.  Returns the index that was double clicked (or activated
 * with enter), or -1.  *selected tracks the highlighted row.
 */
int ui_list(ui_window *window, int x, int y, int w, int h,
            const char *const *items, int count, int *selected, int *scroll)
{
    int row_height = 20;
    int visible = h / row_height;
    int activated = -1;
    static int last_click_index = -1;
    static int last_click_time;

    ui_fill(window, x, y, w, h, UI_SURFACE);
    ui_frame(window, x, y, w, h, UI_BORDER);

    if (ui_hit(window, x, y, w, h)) {
        if (window->wheel) {
            *scroll -= window->wheel * 3;
            window->dirty = 1;
        }
        if (window->mouse_pressed) {
            int index = *scroll + (window->mouse_y - y) / row_height;

            if (index >= 0 && index < count) {
                int now = uptime_ms();

                *selected = index;
                if (last_click_index == index && now - last_click_time < 500)
                    activated = index;
                last_click_index = index;
                last_click_time = now;
                window->dirty = 1;
            }
        }
    }

    if (*scroll > count - visible)
        *scroll = count - visible;
    if (*scroll < 0)
        *scroll = 0;

    ui_clip_set(window, x + 1, y + 1, w - 2, h - 2);
    for (int i = 0; i < visible && *scroll + i < count; i++) {
        int index = *scroll + i;
        int row_y = y + 1 + i * row_height;

        if (index == *selected)
            ui_fill(window, x + 1, row_y, w - 2, row_height, UI_ACCENT);
        ui_text(window, x + 8, row_y + 2, items[index],
                index == *selected ? UI_WHITE : UI_TEXT);
    }
    ui_clip_reset(window);

    /* Scrollbar */
    if (count > visible) {
        int track_height = h - 4;
        int thumb = track_height * visible / count;
        int position = track_height * (*scroll) / count;

        if (thumb < 12)
            thumb = 12;
        ui_fill(window, x + w - 8, y + 2, 6, track_height, UI_BG);
        ui_round_fill(window, x + w - 8, y + 2 + position, 6, thumb, 3, UI_PANEL_LIGHT);
    }

    return activated;
}

void ui_panel(ui_window *window, int x, int y, int w, int h, const char *title)
{
    ui_round_fill(window, x, y, w, h, 6, UI_PANEL);
    ui_frame(window, x, y, w, h, UI_BORDER);
    if (title) {
        ui_text(window, x + 10, y + 8, title, UI_TEXT_DIM);
        ui_fill(window, x + 8, y + 26, w - 16, 1, UI_BORDER);
    }
}

void ui_progress(ui_window *window, int x, int y, int w, int h, int percent, uint32_t color)
{
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;

    ui_round_fill(window, x, y, w, h, h / 2, UI_SURFACE);
    if (percent > 0)
        ui_round_fill(window, x, y, (w * percent) / 100, h, h / 2, color);
    ui_frame(window, x, y, w, h, UI_BORDER);
}
