#ifndef _KERNEL_GFX_H
#define _KERNEL_GFX_H

#include <kernel/types.h>
#include <kernel/bootinfo.h>

/*
 * Everything is drawn into 32-bit surfaces as 0xAARRGGBB.  The screen is one
 * such surface (the back buffer); windows are others.  A surface carries a
 * clip rectangle so a window can never scribble outside itself.
 */
struct gfx_rect {
    int x, y, w, h;
};

struct gfx_surface {
    uint32_t *pixels;
    int       width;
    int       height;
    int       stride;           /* pixels per row, may exceed width */
    struct gfx_rect clip;
};

#define RGB(r, g, b)      (0xFF000000u | ((uint32_t)(r) << 16) | ((uint32_t)(g) << 8) | (uint32_t)(b))
#define RGBA(r, g, b, a)  (((uint32_t)(a) << 24) | ((uint32_t)(r) << 16) | ((uint32_t)(g) << 8) | (uint32_t)(b))
#define COLOR_R(c)        (((c) >> 16) & 0xFF)
#define COLOR_G(c)        (((c) >> 8) & 0xFF)
#define COLOR_B(c)        ((c) & 0xFF)
#define COLOR_A(c)        (((c) >> 24) & 0xFF)

#define GLYPH_W 8
#define GLYPH_H 16

int  gfx_init(const struct bootinfo *info);
int  gfx_available(void);
int  gfx_width(void);
int  gfx_height(void);
struct gfx_surface *gfx_screen(void);       /* the back buffer */

void gfx_present(void);                      /* push the whole back buffer out */
void gfx_present_rect(int x, int y, int w, int h);

/* Surfaces */
void gfx_surface_init(struct gfx_surface *s, uint32_t *pixels, int w, int h, int stride);
void gfx_clip_reset(struct gfx_surface *s);
void gfx_clip_set(struct gfx_surface *s, int x, int y, int w, int h);
int  gfx_clip_intersect(struct gfx_surface *s, int x, int y, int w, int h);

/* Primitives */
void gfx_clear(struct gfx_surface *s, uint32_t color);
void gfx_pixel(struct gfx_surface *s, int x, int y, uint32_t color);
void gfx_fill_rect(struct gfx_surface *s, int x, int y, int w, int h, uint32_t color);
void gfx_blend_rect(struct gfx_surface *s, int x, int y, int w, int h, uint32_t color);
void gfx_frame_rect(struct gfx_surface *s, int x, int y, int w, int h, uint32_t color);
void gfx_round_rect(struct gfx_surface *s, int x, int y, int w, int h, int radius, uint32_t color);
void gfx_hline(struct gfx_surface *s, int x, int y, int w, uint32_t color);
void gfx_vline(struct gfx_surface *s, int x, int y, int h, uint32_t color);
void gfx_line(struct gfx_surface *s, int x0, int y0, int x1, int y1, uint32_t color);
void gfx_circle(struct gfx_surface *s, int cx, int cy, int radius, uint32_t color);
void gfx_gradient_v(struct gfx_surface *s, int x, int y, int w, int h,
                    uint32_t top, uint32_t bottom);
void gfx_blit(struct gfx_surface *dst, int dx, int dy,
              const struct gfx_surface *src, int sx, int sy, int w, int h);
void gfx_blit_alpha(struct gfx_surface *dst, int dx, int dy,
                    const struct gfx_surface *src, int sx, int sy, int w, int h);

/* Text, using the 8x16 font lifted from the video BIOS */
void gfx_char(struct gfx_surface *s, int x, int y, char c, uint32_t color, int scale);
void gfx_text(struct gfx_surface *s, int x, int y, const char *text, uint32_t color, int scale);
void gfx_text_clipped(struct gfx_surface *s, int x, int y, const char *text,
                      uint32_t color, int scale, int max_width);
int  gfx_text_width(const char *text, int scale);
int  gfx_text_height(int scale);
const uint8_t *gfx_font(void);

#endif
