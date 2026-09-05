/*
 * Framebuffer text console.
 *
 * In graphics mode there is no VGA text plane to write to, so the boot log is
 * drawn with the ROM font instead.  The window system turns this off once the
 * desktop owns the screen.
 */
#include <kernel/console.h>
#include <kernel/gfx.h>
#include <kernel/string.h>

#define MARGIN 8

static int cols, rows;
static int cursor_row, cursor_col;
static int ready;

static uint32_t fg = RGB(0xC8, 0xD3, 0xE0);
static uint32_t bg = RGB(0x0B, 0x0E, 0x14);

/*
 * Pushing pixels to the framebuffer is by far the most expensive thing here,
 * so characters are drawn into the back buffer and the touched region is sent
 * out in one go at the end of each line.
 */
static int dirty_x0, dirty_y0, dirty_x1, dirty_y1;

static void dirty_add(int x, int y, int w, int h)
{
    if (dirty_x1 <= dirty_x0 || dirty_y1 <= dirty_y0) {
        dirty_x0 = x;
        dirty_y0 = y;
        dirty_x1 = x + w;
        dirty_y1 = y + h;
        return;
    }
    if (x < dirty_x0) dirty_x0 = x;
    if (y < dirty_y0) dirty_y0 = y;
    if (x + w > dirty_x1) dirty_x1 = x + w;
    if (y + h > dirty_y1) dirty_y1 = y + h;
}

void fbcon_flush(void)
{
    if (dirty_x1 > dirty_x0 && dirty_y1 > dirty_y0)
        gfx_present_rect(dirty_x0, dirty_y0, dirty_x1 - dirty_x0, dirty_y1 - dirty_y0);
    dirty_x0 = dirty_y0 = dirty_x1 = dirty_y1 = 0;
}

int fbcon_init(void)
{
    struct gfx_surface *screen = gfx_screen();

    if (!gfx_available())
        return -1;

    cols = (gfx_width() - MARGIN * 2) / GLYPH_W;
    rows = (gfx_height() - MARGIN * 2) / GLYPH_H;
    cursor_row = cursor_col = 0;

    gfx_clear(screen, bg);
    gfx_present();
    ready = 1;
    return 0;
}

int fbcon_ready(void)
{
    return ready;
}

void fbcon_disable(void)
{
    ready = 0;
}

void fbcon_set_colors(uint32_t foreground, uint32_t background)
{
    fg = foreground;
    bg = background;
}

static void scroll(void)
{
    struct gfx_surface *s = gfx_screen();
    int line = GLYPH_H;
    int top = MARGIN;
    int height = rows * GLYPH_H;

    for (int y = 0; y < height - line; y++) {
        memcpy(s->pixels + (size_t)(top + y) * s->stride,
               s->pixels + (size_t)(top + y + line) * s->stride,
               (size_t)s->width * 4);
    }
    gfx_fill_rect(s, 0, top + height - line, s->width, line, bg);
    cursor_row = rows - 1;
    dirty_add(0, top, s->width, height);
}

void fbcon_putc(char c)
{
    struct gfx_surface *s = gfx_screen();

    if (!ready)
        return;

    switch (c) {
    case '\n':
        cursor_col = 0;
        cursor_row++;
        break;
    case '\r':
        cursor_col = 0;
        break;
    case '\t':
        cursor_col = (cursor_col + 8) & ~7;
        break;
    case '\b':
        if (cursor_col > 0)
            cursor_col--;
        break;
    default:
        if ((unsigned char)c < 0x20)
            return;
        {
            int x = MARGIN + cursor_col * GLYPH_W;
            int y = MARGIN + cursor_row * GLYPH_H;

            gfx_fill_rect(s, x, y, GLYPH_W, GLYPH_H, bg);
            gfx_char(s, x, y, c, fg, 1);
            dirty_add(x, y, GLYPH_W, GLYPH_H);
        }
        cursor_col++;
        break;
    }

    if (cursor_col >= cols) {
        cursor_col = 0;
        cursor_row++;
    }
    while (cursor_row >= rows)
        scroll();

    if (c == '\n')
        fbcon_flush();
}
