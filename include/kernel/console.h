#ifndef _KERNEL_CONSOLE_H
#define _KERNEL_CONSOLE_H

#include <kernel/types.h>

/* ---- VGA text mode ---- */
#define VGA_BLACK         0
#define VGA_BLUE          1
#define VGA_GREEN         2
#define VGA_CYAN          3
#define VGA_RED           4
#define VGA_MAGENTA       5
#define VGA_BROWN         6
#define VGA_LIGHT_GREY    7
#define VGA_DARK_GREY     8
#define VGA_LIGHT_BLUE    9
#define VGA_LIGHT_GREEN   10
#define VGA_LIGHT_CYAN    11
#define VGA_LIGHT_RED     12
#define VGA_LIGHT_MAGENTA 13
#define VGA_YELLOW        14
#define VGA_WHITE         15

void vga_init(void);
void vga_putc(char c);
void vga_write(const char *s, size_t n);
void vga_clear(void);
void vga_set_color(uint8_t fg, uint8_t bg);
void vga_get_cursor(int *row, int *col);

/* ---- 16550 UART on COM1 ---- */
void vga_status(const char *text);
void serial_init(void);
void serial_putc(char c);
void serial_write(const char *s, size_t n);
int  serial_poll(void);          /* -1 when no byte is waiting */

/* ---- console: fan out to every attached device ---- */
void console_init(int text_mode);
void console_attach_screen(void);
void console_set_screen_output(int enabled);
uint32_t console_log_read(char *buffer, uint32_t size);

/* framebuffer text console */
int  fbcon_init(void);
int  fbcon_ready(void);
void fbcon_disable(void);
void fbcon_putc(char c);
void fbcon_set_colors(uint32_t foreground, uint32_t background);
void fbcon_flush(void);
void console_putc(char c);
void console_write(const char *s, size_t n);
void console_clear(void);
int  console_getc(void);         /* blocking, keyboard or serial */
int  console_trygetc(void);      /* -1 when nothing is pending */

/* Keys with no ASCII equivalent are reported above the byte range. */
#define KEY_UP     0x100
#define KEY_DOWN   0x101
#define KEY_LEFT   0x102
#define KEY_RIGHT  0x103
#define KEY_HOME   0x104
#define KEY_END    0x105
#define KEY_DELETE 0x106
#define KEY_PGUP   0x107
#define KEY_PGDN   0x108

#endif
