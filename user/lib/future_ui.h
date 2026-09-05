#ifndef _FUTURE_UI_H
#define _FUTURE_UI_H

/*
 * Sifar Future UI layer.
 *
 * This is intentionally header-only for the 2.0 overhaul so applications can
 * adopt it incrementally without changing the linker contract. It builds a
 * proportional, softer UI face from the kernel's trusted 8x16 glyph source and
 * adds a small set of semantic surfaces. Terminal-style applications can keep
 * the fixed-cell renderer while product UI stops looking like a terminal.
 */
#include "ui.h"

#define FU_RADIUS       14
#define FU_CARD_RADIUS  12
#define FU_PAD          18
#define FU_ROW          28

static uint8_t fu_font[4096];
static int fu_font_ready;

static int fu_init(void)
{
    if (fu_font_ready)
        return 0;
    if (syscall3(SYS_FONT, (int)fu_font, sizeof(fu_font), 0) <= 0)
        return -1;
    fu_font_ready = 1;
    return 0;
}

static void fu_glyph_bounds(unsigned char ch, int *left, int *right)
{
    const uint8_t *glyph = fu_font + ch * UI_GLYPH_H;
    int lo = UI_GLYPH_W;
    int hi = -1;

    if (ch == ' ') {
        *left = 0;
        *right = 2;
        return;
    }

    for (int row = 0; row < UI_GLYPH_H; row++) {
        uint8_t bits = glyph[row];
        for (int col = 0; col < UI_GLYPH_W; col++) {
            if (bits & (0x80u >> col)) {
                if (col < lo)
                    lo = col;
                if (col > hi)
                    hi = col;
            }
        }
    }

    if (hi < lo) {
        lo = 0;
        hi = 3;
    }
    *left = lo;
    *right = hi;
}

static int fu_advance(unsigned char ch)
{
    int left, right;
    fu_glyph_bounds(ch, &left, &right);
    return (right - left + 1) + 2;
}

static int fu_text_width(const char *text)
{
    int width = 0;

    fu_init();
    for (; text && *text; text++) {
        if (*text == '\n')
            break;
        width += fu_advance((unsigned char)*text);
    }
    return width;
}

static void fu_text(ui_window *w, int x, int y, const char *text,
                    uint32_t color)
{
    fu_init();
    for (; text && *text; text++) {
        unsigned char ch = (unsigned char)*text;
        const uint8_t *glyph;
        int left, right;

        if (ch == '\n') {
            y += UI_GLYPH_H + 4;
            continue;
        }

        glyph = fu_font + ch * UI_GLYPH_H;
        fu_glyph_bounds(ch, &left, &right);

        for (int row = 0; row < UI_GLYPH_H; row++) {
            uint8_t bits = glyph[row];
            for (int col = left; col <= right; col++) {
                if (!(bits & (0x80u >> col)))
                    continue;

                /* A one-pixel low-alpha halo softens the console bitmap edge.
                 * The solid center stays crisp on the software compositor. */
                ui_blend(w, x + col - left - 1, y + row, 1, 1,
                         UI_RGBA(255, 255, 255, 28));
                ui_blend(w, x + col - left + 1, y + row, 1, 1,
                         UI_RGBA(255, 255, 255, 28));
                ui_blend(w, x + col - left, y + row - 1, 1, 1,
                         UI_RGBA(255, 255, 255, 22));
                ui_blend(w, x + col - left, y + row + 1, 1, 1,
                         UI_RGBA(255, 255, 255, 22));
                ui_pixel(w, x + col - left, y + row, color);
            }
        }
        x += fu_advance(ch);
    }
    w->dirty = 1;
}

static void fu_text_center(ui_window *w, int x, int y, int width,
                           const char *text, uint32_t color)
{
    fu_text(w, x + (width - fu_text_width(text)) / 2, y, text, color);
}

static void fu_card(ui_window *w, int x, int y, int width, int height)
{
    /* Shadow + translucent-looking layered surface without requiring a blur
     * shader or GPU compositor. */
    ui_round_fill(w, x + 3, y + 5, width, height, FU_CARD_RADIUS,
                  UI_RGB(0x06, 0x0A, 0x12));
    ui_round_fill(w, x, y, width, height, FU_CARD_RADIUS, UI_PANEL);
    ui_blend(w, x + 1, y + 1, width - 2, 1,
             UI_RGBA(0xFF, 0xFF, 0xFF, 22));
}

static void fu_chip(ui_window *w, int x, int y, const char *label,
                    uint32_t accent)
{
    int width = fu_text_width(label) + 20;
    ui_round_fill(w, x, y, width, 26, 13, UI_SURFACE_ALT);
    ui_circle(w, x + 10, y + 13, 3, accent);
    fu_text(w, x + 17, y + 5, label, UI_TEXT);
}

static int fu_button(ui_window *w, int x, int y, int width, int height,
                     const char *label, uint32_t accent)
{
    int id = ++w->widget_counter;
    int hover = ui_hit(w, x, y, width, height);
    int clicked = 0;
    uint32_t face = hover ? UI_PANEL_LIGHT : UI_SURFACE_ALT;

    if (hover && w->mouse_pressed) {
        w->active = id;
        w->focus = id;
    }
    if (w->active == id && w->mouse_released) {
        if (hover)
            clicked = 1;
        w->active = 0;
    }

    if (w->active == id && hover)
        face = UI_SURFACE;

    ui_round_fill(w, x, y, width, height, height / 2, face);
    if (accent)
        ui_fill(w, x + 11, y + height - 5, width - 22, 2, accent);
    fu_text_center(w, x, y + (height - UI_GLYPH_H) / 2, width, label,
                   hover ? UI_WHITE : UI_TEXT);
    return clicked;
}

static void fu_section_title(ui_window *w, int x, int y, const char *eyebrow,
                             const char *title)
{
    fu_text(w, x, y, eyebrow, UI_ACCENT_LIGHT);
    ui_text_scaled(w, x, y + 23, title, UI_TEXT, 2);
}

static void fu_metric(ui_window *w, int x, int y, int width,
                      const char *label, const char *value,
                      const char *detail, uint32_t accent)
{
    fu_card(w, x, y, width, 94);
    fu_text(w, x + 16, y + 14, label, UI_TEXT_DIM);
    fu_text(w, x + 16, y + 39, value, UI_TEXT);
    ui_fill(w, x + 16, y + 65, 28, 3, accent);
    fu_text(w, x + 54, y + 59, detail, UI_TEXT_DIM);
}

static uint32_t fu_mode_color(const char *mode)
{
    if (!mode)
        return UI_ACCENT;
    if (strcmp(mode, "defensive") == 0)
        return UI_BAD;
    if (strcmp(mode, "pressure") == 0)
        return UI_WARN;
    if (strcmp(mode, "responsive") == 0)
        return UI_GOOD;
    if (strcmp(mode, "quiet") == 0)
        return UI_ACCENT_LIGHT;
    return UI_ACCENT;
}

#endif
