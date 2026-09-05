#ifndef _UI_H
#define _UI_H

/*
 * The SifarOS widget toolkit.
 *
 * Immediate mode: an application redraws its window from scratch whenever
 * something changes, and widgets report what happened as they are drawn.
 * There is no widget tree to keep in sync, which suits programs that are
 * mostly a few controls over a drawing area.
 */
#include "sifar.h"

#define UI_GLYPH_W 8
#define UI_GLYPH_H 16

/* SifarOS 2.0 palette: deep neutral surfaces, cobalt accent, softer contrast. */
#define UI_BG            0xFF0A0F1Cu
#define UI_PANEL         0xFF111827u
#define UI_PANEL_LIGHT   0xFF1A2436u
#define UI_SURFACE       0xFF0E1626u
#define UI_SURFACE_ALT   0xFF162033u
#define UI_ACCENT        0xFF4F7DF3u
#define UI_ACCENT_LIGHT  0xFF78A1FFu
#define UI_TEXT          0xFFF4F7FBu
#define UI_TEXT_DIM      0xFF93A4BAu
#define UI_BORDER        0xFF253248u
#define UI_GOOD          0xFF45D39Au
#define UI_WARN          0xFFF2B84Bu
#define UI_BAD           0xFFF06C75u
#define UI_WHITE         0xFFFFFFFFu
#define UI_BLACK         0xFF000000u

#define UI_RGB(r, g, b) (0xFF000000u | ((uint32_t)(r) << 16) | ((uint32_t)(g) << 8) | (uint32_t)(b))
#define UI_RGBA(r, g, b, a) (((uint32_t)(a) << 24) | ((uint32_t)(r) << 16) | ((uint32_t)(g) << 8) | (uint32_t)(b))

typedef struct {
    int x, y, w, h;
} ui_rect;

typedef struct {
    uint32_t *pixels;
    int       width, height, stride;
    ui_rect   clip;
} ui_surface;

typedef struct ui_window {
    int        id;
    ui_surface surface;
    int        width, height;
    int        closed;
    int        focused;
    int        dirty;

    /* input state for the current frame */
    int        mouse_x, mouse_y;
    int        mouse_down;
    int        mouse_pressed;
    int        mouse_released;
    int        wheel;
    unsigned   keys[8];
    int        key_count;

    int        widget_counter;
    int        active;          /* widget currently held down */
    int        focus;           /* widget with keyboard focus */
} ui_window;

/* ---- lifecycle ---- */
int         ui_init(void);
ui_window  *ui_window_open(const char *title, int width, int height, unsigned flags);
void        ui_window_close(ui_window *window);
void        ui_set_title(ui_window *window, const char *title);
void        ui_move(ui_window *window, int x, int y);
void        ui_resize(ui_window *window, int width, int height);
int         ui_screen_size(int *width, int *height);

/* Pump events into the window state.  Returns 0 when the window should close. */
int         ui_begin(ui_window *window);
void        ui_end(ui_window *window);          /* flush the damaged region */
void        ui_frame_wait(void);                /* pace the redraw loop */
void        ui_redraw(ui_window *window);       /* force a repaint next frame */
int         ui_key(ui_window *window, unsigned key);   /* was this key pressed? */

/* ---- drawing ---- */
void ui_clip_set(ui_window *window, int x, int y, int w, int h);
void ui_clip_reset(ui_window *window);
void ui_clear(ui_window *window, uint32_t color);
void ui_pixel(ui_window *window, int x, int y, uint32_t color);
void ui_fill(ui_window *window, int x, int y, int w, int h, uint32_t color);
void ui_blend(ui_window *window, int x, int y, int w, int h, uint32_t color);
void ui_frame(ui_window *window, int x, int y, int w, int h, uint32_t color);
void ui_round_fill(ui_window *window, int x, int y, int w, int h, int radius, uint32_t color);
void ui_gradient(ui_window *window, int x, int y, int w, int h, uint32_t top, uint32_t bottom);
void ui_line(ui_window *window, int x0, int y0, int x1, int y1, uint32_t color);
void ui_circle(ui_window *window, int cx, int cy, int radius, uint32_t color);
void ui_text(ui_window *window, int x, int y, const char *text, uint32_t color);
void ui_text_scaled(ui_window *window, int x, int y, const char *text, uint32_t color, int scale);
void ui_text_center(ui_window *window, int x, int y, int w, const char *text, uint32_t color);
int  ui_text_width(const char *text);
int  ui_text_width_scaled(const char *text, int scale);

/* ---- widgets ---- */
int  ui_button(ui_window *window, int x, int y, int w, int h, const char *label);
int  ui_button_colored(ui_window *window, int x, int y, int w, int h,
                       const char *label, uint32_t color);
int  ui_toggle(ui_window *window, int x, int y, const char *label, int *value);
int  ui_textbox(ui_window *window, int x, int y, int w, const char *label,
                char *text, int capacity);
int  ui_list(ui_window *window, int x, int y, int w, int h,
             const char *const *items, int count, int *selected, int *scroll);
void ui_panel(ui_window *window, int x, int y, int w, int h, const char *title);
void ui_progress(ui_window *window, int x, int y, int w, int h, int percent, uint32_t color);
int  ui_hit(ui_window *window, int x, int y, int w, int h);

#endif
