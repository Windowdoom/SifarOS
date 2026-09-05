/*
 * VGA text mode driver (80x25, memory mapped at 0xB8000).
 *
 * The bottom row is reserved as a status bar, so the scrolling text area is
 * rows 0..23.
 */
#include <kernel/console.h>
#include <kernel/string.h>
#include <kernel/io.h>

#define VGA_MEM     ((volatile uint16_t *)0x000B8000)
#define VGA_COLS    80
#define VGA_ROWS    25
#define TEXT_ROWS   (VGA_ROWS - 1)
#define STATUS_ROW  (VGA_ROWS - 1)

#define CRTC_INDEX  0x3D4
#define CRTC_DATA   0x3D5

static uint8_t color = (VGA_BLACK << 4) | VGA_LIGHT_GREY;
static int     row;
static int     col;

static uint16_t cell(char c, uint8_t attr)
{
    return (uint16_t)c | ((uint16_t)attr << 8);
}

static void move_hw_cursor(void)
{
    uint16_t pos = (uint16_t)(row * VGA_COLS + col);

    outb(CRTC_INDEX, 0x0F);
    outb(CRTC_DATA, (uint8_t)(pos & 0xFF));
    outb(CRTC_INDEX, 0x0E);
    outb(CRTC_DATA, (uint8_t)((pos >> 8) & 0xFF));
}

static void scroll(void)
{
    if (row < TEXT_ROWS)
        return;

    for (int r = 1; r < TEXT_ROWS; r++) {
        for (int c = 0; c < VGA_COLS; c++)
            VGA_MEM[(r - 1) * VGA_COLS + c] = VGA_MEM[r * VGA_COLS + c];
    }
    for (int c = 0; c < VGA_COLS; c++)
        VGA_MEM[(TEXT_ROWS - 1) * VGA_COLS + c] = cell(' ', color);

    row = TEXT_ROWS - 1;
}

void vga_set_color(uint8_t fg, uint8_t bg)
{
    color = (uint8_t)((bg << 4) | (fg & 0x0F));
}

void vga_clear(void)
{
    for (int r = 0; r < TEXT_ROWS; r++) {
        for (int c = 0; c < VGA_COLS; c++)
            VGA_MEM[r * VGA_COLS + c] = cell(' ', color);
    }
    row = 0;
    col = 0;
    move_hw_cursor();
}

void vga_putc(char c)
{
    switch (c) {
    case '\n':
        col = 0;
        row++;
        break;
    case '\r':
        col = 0;
        break;
    case '\b':
        /* Terminal semantics: move left, do not erase.  Callers that want a
           destructive backspace write "\b \b" like they would to a tty. */
        if (col > 0) {
            col--;
        } else if (row > 0) {
            row--;
            col = VGA_COLS - 1;
        }
        break;
    case '\t':
        col = (col + 8) & ~7;
        break;
    default:
        if ((unsigned char)c < 0x20)
            return;
        VGA_MEM[row * VGA_COLS + col] = cell(c, color);
        col++;
        break;
    }

    if (col >= VGA_COLS) {
        col = 0;
        row++;
    }
    scroll();
    move_hw_cursor();
}

void vga_write(const char *s, size_t n)
{
    while (n--)
        vga_putc(*s++);
}

void vga_get_cursor(int *out_row, int *out_col)
{
    if (out_row)
        *out_row = row;
    if (out_col)
        *out_col = col;
}

/* Paint the reserved bottom line.  Text is clipped at 80 columns. */
void vga_status(const char *text)
{
    uint8_t attr = (uint8_t)((VGA_BLUE << 4) | VGA_WHITE);
    int i = 0;

    for (; text[i] && i < VGA_COLS; i++)
        VGA_MEM[STATUS_ROW * VGA_COLS + i] = cell(text[i], attr);
    for (; i < VGA_COLS; i++)
        VGA_MEM[STATUS_ROW * VGA_COLS + i] = cell(' ', attr);
}

void vga_init(void)
{
    /* Enable the underline cursor (scanlines 14-15). */
    outb(CRTC_INDEX, 0x0A);
    outb(CRTC_DATA, 0x0E);
    outb(CRTC_INDEX, 0x0B);
    outb(CRTC_DATA, 0x0F);

    row = 0;
    col = 0;
    vga_clear();
    vga_status(" SifarOS ");
}
