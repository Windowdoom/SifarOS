/*
 * Software graphics.
 *
 * Stage 2 put the card into a 32-bit linear framebuffer mode and told us where
 * it lives.  We map that memory, draw everything into a back buffer in RAM,
 * and copy finished frames out; drawing straight into the framebuffer over the
 * PCI bus would be far slower and would tear.
 */
#include <kernel/gfx.h>
#include <kernel/mm.h>
#include <kernel/string.h>
#include <kernel/kprintf.h>

#define FB_VIRT_BASE KERNEL_FB_BASE

static uint32_t *framebuffer;
static int       fb_width, fb_height, fb_stride;
static int       available;

static struct gfx_surface back;
static uint8_t   font[4096];

int gfx_available(void) { return available; }
int gfx_width(void)     { return fb_width; }
int gfx_height(void)    { return fb_height; }
struct gfx_surface *gfx_screen(void) { return &back; }
const uint8_t *gfx_font(void) { return font; }

int gfx_init(const struct bootinfo *info)
{
    uint32_t bytes;
    uint32_t pages;

    if (!info->fb_present || info->fb_bpp != 32 || !info->fb_addr)
        return -1;

    fb_width  = (int)info->fb_width;
    fb_height = (int)info->fb_height;
    fb_stride = (int)(info->fb_pitch / 4);

    /* The framebuffer lives outside RAM, so it needs its own mapping. */
    bytes = info->fb_pitch * info->fb_height;
    pages = (bytes + PAGE_SIZE - 1) / PAGE_SIZE;
    for (uint32_t i = 0; i < pages; i++) {
        if (vmm_map(FB_VIRT_BASE + i * PAGE_SIZE, info->fb_addr + i * PAGE_SIZE,
                    PTE_PRESENT | PTE_WRITE) < 0)
            return -1;
    }
    framebuffer = (uint32_t *)FB_VIRT_BASE;

    /* The font stage 2 copied out of the video BIOS sits in low memory. */
    memcpy(font, (const void *)(uintptr_t)info->font_addr, sizeof(font));

    {
        uint32_t *pixels = (uint32_t *)kmalloc((size_t)fb_width * fb_height * 4);

        if (!pixels)
            return -1;
        gfx_surface_init(&back, pixels, fb_width, fb_height, fb_width);
    }

    available = 1;
    gfx_clear(&back, RGB(0, 0, 0));
    gfx_present();
    return 0;
}

void gfx_surface_init(struct gfx_surface *s, uint32_t *pixels, int w, int h, int stride)
{
    s->pixels = pixels;
    s->width  = w;
    s->height = h;
    s->stride = stride;
    gfx_clip_reset(s);
}

void gfx_clip_reset(struct gfx_surface *s)
{
    s->clip.x = 0;
    s->clip.y = 0;
    s->clip.w = s->width;
    s->clip.h = s->height;
}

void gfx_clip_set(struct gfx_surface *s, int x, int y, int w, int h)
{
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > s->width)  w = s->width - x;
    if (y + h > s->height) h = s->height - y;
    if (w < 0) w = 0;
    if (h < 0) h = 0;

    s->clip.x = x;
    s->clip.y = y;
    s->clip.w = w;
    s->clip.h = h;
}

/* Clamp a rectangle to the clip region.  Returns 0 when nothing is left. */
static int clamp(const struct gfx_surface *s, int *x, int *y, int *w, int *h)
{
    int x0 = s->clip.x, y0 = s->clip.y;
    int x1 = s->clip.x + s->clip.w, y1 = s->clip.y + s->clip.h;

    if (*x < x0) { *w -= x0 - *x; *x = x0; }
    if (*y < y0) { *h -= y0 - *y; *y = y0; }
    if (*x + *w > x1) *w = x1 - *x;
    if (*y + *h > y1) *h = y1 - *y;

    return (*w > 0 && *h > 0);
}

int gfx_clip_intersect(struct gfx_surface *s, int x, int y, int w, int h)
{
    return clamp(s, &x, &y, &w, &h);
}

void gfx_present(void)
{
    if (!available)
        return;

    if (fb_stride == fb_width) {
        memcpy(framebuffer, back.pixels, (size_t)fb_width * fb_height * 4);
    } else {
        for (int y = 0; y < fb_height; y++)
            memcpy(framebuffer + (size_t)y * fb_stride,
                   back.pixels + (size_t)y * back.stride,
                   (size_t)fb_width * 4);
    }
}

void gfx_present_rect(int x, int y, int w, int h)
{
    if (!available)
        return;

    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > fb_width)  w = fb_width - x;
    if (y + h > fb_height) h = fb_height - y;
    if (w <= 0 || h <= 0)
        return;

    for (int row = 0; row < h; row++)
        memcpy(framebuffer + (size_t)(y + row) * fb_stride + x,
               back.pixels + (size_t)(y + row) * back.stride + x,
               (size_t)w * 4);
}

/* ------------------------------------------------------------- primitives */

void gfx_clear(struct gfx_surface *s, uint32_t color)
{
    for (int y = 0; y < s->height; y++) {
        uint32_t *row = s->pixels + (size_t)y * s->stride;

        for (int x = 0; x < s->width; x++)
            row[x] = color;
    }
}

void gfx_pixel(struct gfx_surface *s, int x, int y, uint32_t color)
{
    if (x < s->clip.x || y < s->clip.y ||
        x >= s->clip.x + s->clip.w || y >= s->clip.y + s->clip.h)
        return;
    s->pixels[(size_t)y * s->stride + x] = color;
}

void gfx_fill_rect(struct gfx_surface *s, int x, int y, int w, int h, uint32_t color)
{
    if (!clamp(s, &x, &y, &w, &h))
        return;

    for (int row = 0; row < h; row++) {
        uint32_t *p = s->pixels + (size_t)(y + row) * s->stride + x;

        for (int col = 0; col < w; col++)
            p[col] = color;
    }
}

/* Blend a translucent colour over what is already there. */
void gfx_blend_rect(struct gfx_surface *s, int x, int y, int w, int h, uint32_t color)
{
    uint32_t alpha = COLOR_A(color);

    if (alpha == 255) {
        gfx_fill_rect(s, x, y, w, h, color);
        return;
    }
    if (alpha == 0 || !clamp(s, &x, &y, &w, &h))
        return;

    for (int row = 0; row < h; row++) {
        uint32_t *p = s->pixels + (size_t)(y + row) * s->stride + x;

        for (int col = 0; col < w; col++) {
            uint32_t dst = p[col];
            uint32_t r = (COLOR_R(color) * alpha + COLOR_R(dst) * (255 - alpha)) / 255;
            uint32_t g = (COLOR_G(color) * alpha + COLOR_G(dst) * (255 - alpha)) / 255;
            uint32_t b = (COLOR_B(color) * alpha + COLOR_B(dst) * (255 - alpha)) / 255;

            p[col] = RGB(r, g, b);
        }
    }
}

void gfx_hline(struct gfx_surface *s, int x, int y, int w, uint32_t color)
{
    gfx_fill_rect(s, x, y, w, 1, color);
}

void gfx_vline(struct gfx_surface *s, int x, int y, int h, uint32_t color)
{
    gfx_fill_rect(s, x, y, 1, h, color);
}

void gfx_frame_rect(struct gfx_surface *s, int x, int y, int w, int h, uint32_t color)
{
    if (w <= 0 || h <= 0)
        return;
    gfx_hline(s, x, y, w, color);
    gfx_hline(s, x, y + h - 1, w, color);
    gfx_vline(s, x, y, h, color);
    gfx_vline(s, x + w - 1, y, h, color);
}

void gfx_round_rect(struct gfx_surface *s, int x, int y, int w, int h,
                    int radius, uint32_t color)
{
    if (radius * 2 > w) radius = w / 2;
    if (radius * 2 > h) radius = h / 2;
    if (radius <= 0) {
        gfx_fill_rect(s, x, y, w, h, color);
        return;
    }

    gfx_fill_rect(s, x + radius, y, w - 2 * radius, h, color);
    gfx_fill_rect(s, x, y + radius, radius, h - 2 * radius, color);
    gfx_fill_rect(s, x + w - radius, y + radius, radius, h - 2 * radius, color);

    for (int dy = 0; dy < radius; dy++) {
        /* horizontal extent of the corner arc on this row */
        int dx = 0;
        int limit = radius * radius;

        while ((radius - dy) * (radius - dy) + (radius - dx - 1) * (radius - dx - 1) > limit &&
               dx < radius)
            dx++;

        gfx_hline(s, x + dx, y + dy, w - 2 * dx, color);
        gfx_hline(s, x + dx, y + h - 1 - dy, w - 2 * dx, color);
    }
}

void gfx_line(struct gfx_surface *s, int x0, int y0, int x1, int y1, uint32_t color)
{
    int dx = (x1 > x0) ? (x1 - x0) : (x0 - x1);
    int dy = (y1 > y0) ? (y1 - y0) : (y0 - y1);
    int sx = (x0 < x1) ? 1 : -1;
    int sy = (y0 < y1) ? 1 : -1;
    int err = dx - dy;

    for (;;) {
        gfx_pixel(s, x0, y0, color);
        if (x0 == x1 && y0 == y1)
            break;
        int e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx)  { err += dx; y0 += sy; }
    }
}

void gfx_circle(struct gfx_surface *s, int cx, int cy, int radius, uint32_t color)
{
    for (int dy = -radius; dy <= radius; dy++) {
        int span = 0;

        while ((span + 1) * (span + 1) + dy * dy <= radius * radius)
            span++;
        gfx_hline(s, cx - span, cy + dy, span * 2 + 1, color);
    }
}

void gfx_gradient_v(struct gfx_surface *s, int x, int y, int w, int h,
                    uint32_t top, uint32_t bottom)
{
    if (h <= 0)
        return;

    for (int row = 0; row < h; row++) {
        uint32_t r = (COLOR_R(top) * (h - 1 - row) + COLOR_R(bottom) * row) / (h - 1 ? h - 1 : 1);
        uint32_t g = (COLOR_G(top) * (h - 1 - row) + COLOR_G(bottom) * row) / (h - 1 ? h - 1 : 1);
        uint32_t b = (COLOR_B(top) * (h - 1 - row) + COLOR_B(bottom) * row) / (h - 1 ? h - 1 : 1);

        gfx_hline(s, x, y + row, w, RGB(r, g, b));
    }
}

void gfx_blit(struct gfx_surface *dst, int dx, int dy,
              const struct gfx_surface *src, int sx, int sy, int w, int h)
{
    int ox = dx, oy = dy;

    if (!clamp(dst, &dx, &dy, &w, &h))
        return;
    sx += dx - ox;
    sy += dy - oy;

    for (int row = 0; row < h; row++) {
        if (sy + row < 0 || sy + row >= src->height)
            continue;
        memcpy(dst->pixels + (size_t)(dy + row) * dst->stride + dx,
               src->pixels + (size_t)(sy + row) * src->stride + sx,
               (size_t)w * 4);
    }
}

void gfx_blit_alpha(struct gfx_surface *dst, int dx, int dy,
                    const struct gfx_surface *src, int sx, int sy, int w, int h)
{
    int ox = dx, oy = dy;

    if (!clamp(dst, &dx, &dy, &w, &h))
        return;
    sx += dx - ox;
    sy += dy - oy;

    for (int row = 0; row < h; row++) {
        uint32_t       *d = dst->pixels + (size_t)(dy + row) * dst->stride + dx;
        const uint32_t *s = src->pixels + (size_t)(sy + row) * src->stride + sx;

        for (int col = 0; col < w; col++) {
            uint32_t pixel = s[col];
            uint32_t alpha = COLOR_A(pixel);

            if (alpha == 255) {
                d[col] = pixel;
            } else if (alpha) {
                uint32_t back = d[col];
                uint32_t r = (COLOR_R(pixel) * alpha + COLOR_R(back) * (255 - alpha)) / 255;
                uint32_t g = (COLOR_G(pixel) * alpha + COLOR_G(back) * (255 - alpha)) / 255;
                uint32_t b = (COLOR_B(pixel) * alpha + COLOR_B(back) * (255 - alpha)) / 255;

                d[col] = RGB(r, g, b);
            }
        }
    }
}

/* ------------------------------------------------------------------- text */

void gfx_char(struct gfx_surface *s, int x, int y, char c, uint32_t color, int scale)
{
    const uint8_t *glyph = font + ((unsigned char)c * GLYPH_H);

    if (scale < 1)
        scale = 1;

    for (int row = 0; row < GLYPH_H; row++) {
        uint8_t bits = glyph[row];

        for (int col = 0; col < GLYPH_W; col++) {
            if (!(bits & (0x80 >> col)))
                continue;
            if (scale == 1)
                gfx_pixel(s, x + col, y + row, color);
            else
                gfx_fill_rect(s, x + col * scale, y + row * scale, scale, scale, color);
        }
    }
}

void gfx_text(struct gfx_surface *s, int x, int y, const char *text, uint32_t color, int scale)
{
    if (scale < 1)
        scale = 1;

    for (; *text; text++) {
        if (*text == '\n') {
            y += GLYPH_H * scale;
            continue;
        }
        gfx_char(s, x, y, *text, color, scale);
        x += GLYPH_W * scale;
    }
}

/* Draw text, stopping with an ellipsis if it will not fit. */
void gfx_text_clipped(struct gfx_surface *s, int x, int y, const char *text,
                      uint32_t color, int scale, int max_width)
{
    int advance = GLYPH_W * (scale < 1 ? 1 : scale);
    int room = max_width / advance;
    int length = (int)strlen(text);

    if (length <= room) {
        gfx_text(s, x, y, text, color, scale);
        return;
    }
    if (room <= 3) {
        for (int i = 0; i < room; i++)
            gfx_char(s, x + i * advance, y, '.', color, scale);
        return;
    }

    for (int i = 0; i < room - 3; i++)
        gfx_char(s, x + i * advance, y, text[i], color, scale);
    for (int i = room - 3; i < room; i++)
        gfx_char(s, x + i * advance, y, '.', color, scale);
}

int gfx_text_width(const char *text, int scale)
{
    return (int)strlen(text) * GLYPH_W * (scale < 1 ? 1 : scale);
}

int gfx_text_height(int scale)
{
    return GLYPH_H * (scale < 1 ? 1 : scale);
}
