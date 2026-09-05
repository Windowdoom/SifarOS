/*
 * Console multiplexer.
 *
 * Output goes to the serial line always, to the screen while the kernel owns
 * it, and into a ring buffer that survives the handover to the desktop so the
 * boot log can still be read afterwards. Input arrives from either the PS/2
 * keyboard or the serial line, which is what lets the whole system be driven
 * headlessly from a script.
 */
#include <kernel/console.h>
#include <arch/x86.h>
#include <kernel/sched.h>
#include <kernel/io.h>
#include <kernel/string.h>

#define KLOG_SIZE (64 * 1024)

static char     klog[KLOG_SIZE];
static uint32_t klog_head;
static int      have_serial;
static int      have_vga_text;
static int      screen_enabled = 1;
static int      keyboard_enabled = 1;

static void klog_putc(char c)
{
    klog[klog_head % KLOG_SIZE] = c;
    klog_head++;
}

uint32_t console_log_read(char *buffer, uint32_t size)
{
    uint32_t available = (klog_head < KLOG_SIZE) ? klog_head : KLOG_SIZE;
    uint32_t start = (klog_head < KLOG_SIZE) ? 0 : klog_head % KLOG_SIZE;
    uint32_t count = (available < size) ? available : size;
    uint32_t skip = available - count;

    for (uint32_t i = 0; i < count; i++)
        buffer[i] = klog[(start + skip + i) % KLOG_SIZE];
    return count;
}

void console_init(int text_mode)
{
    serial_init();
    have_serial = 1;
    have_vga_text = text_mode;
    if (text_mode)
        vga_init();
}

void console_attach_screen(void)
{
    uint32_t available = (klog_head < KLOG_SIZE) ? klog_head : KLOG_SIZE;
    uint32_t start = (klog_head < KLOG_SIZE) ? 0 : klog_head % KLOG_SIZE;

    for (uint32_t i = 0; i < available; i++)
        fbcon_putc(klog[(start + i) % KLOG_SIZE]);
}

void console_set_screen_output(int enabled)
{
    screen_enabled = enabled;
    if (!enabled)
        fbcon_disable();
}

void console_set_keyboard_input(int enabled)
{
    keyboard_enabled = enabled;
}

void console_putc(char c)
{
    klog_putc(c);

    if (have_serial)
        serial_putc(c);
    if (!screen_enabled)
        return;
    if (have_vga_text)
        vga_putc(c);
    else if (fbcon_ready())
        fbcon_putc(c);
}

void console_write(const char *s, size_t n)
{
    while (n--)
        console_putc(*s++);
}

void console_clear(void)
{
    if (have_vga_text)
        vga_clear();
    if (have_serial)
        serial_write("\033[2J\033[H", 7);
}

static int decode_serial_escape(void)
{
    int spin = 200000;
    int c1 = -1, c2 = -1;

    while (spin-- > 0 && (c1 = serial_poll()) < 0)
        ;
    if (c1 != '[')
        return 27;

    spin = 200000;
    while (spin-- > 0 && (c2 = serial_poll()) < 0)
        ;

    switch (c2) {
    case 'A': return KEY_UP;
    case 'B': return KEY_DOWN;
    case 'C': return KEY_RIGHT;
    case 'D': return KEY_LEFT;
    case 'H': return KEY_HOME;
    case 'F': return KEY_END;
    case '3': {
        int spin2 = 200000, c3 = -1;
        while (spin2-- > 0 && (c3 = serial_poll()) < 0)
            ;
        (void)c3;
        return KEY_DELETE;
    }
    default:  return 27;
    }
}

int console_trygetc(void)
{
    int c = -1;

    if (keyboard_enabled) {
        c = keyboard_trygetc();
        if (c >= 0)
            return c;
    }

    c = serial_poll();
    if (c < 0)
        return -1;
    if (c == 27)
        return decode_serial_escape();
    if (c == 127)
        return '\b';
    if (c == '\r')
        return '\n';
    return c;
}

int console_getc(void)
{
    for (;;) {
        int c = console_trygetc();
        if (c >= 0)
            return c;
        sched_yield();
    }
}
