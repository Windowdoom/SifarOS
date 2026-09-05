/*
 * Console multiplexer.
 *
 * Output goes to the VGA screen and the serial line at once.  Input arrives
 * from either the PS/2 keyboard or the serial line, which is what lets the
 * whole system be driven headlessly from a script.
 */
#include <kernel/console.h>
#include <arch/x86.h>
#include <kernel/sched.h>
#include <kernel/io.h>

static int have_serial;

void console_init(void)
{
    vga_init();
    serial_init();
    have_serial = 1;
}

void console_putc(char c)
{
    vga_putc(c);
    if (have_serial)
        serial_putc(c);
}

void console_write(const char *s, size_t n)
{
    while (n--)
        console_putc(*s++);
}

void console_clear(void)
{
    vga_clear();
    if (have_serial) {
        /* ANSI: clear screen, home the cursor. */
        serial_write("\033[2J\033[H", 7);
    }
}

/*
 * Terminals send arrow keys as escape sequences.  Decode the common ones so
 * that a serial user gets the same key codes as someone at the keyboard.
 */
static int decode_serial_escape(void)
{
    int spin = 200000;
    int c1 = -1, c2 = -1;

    while (spin-- > 0 && (c1 = serial_poll()) < 0)
        ;
    if (c1 != '[')
        return 27;                  /* bare ESC */

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
        (void)c3;                   /* swallow the trailing '~' */
        return KEY_DELETE;
    }
    default:  return 27;
    }
}

int console_trygetc(void)
{
    int c = keyboard_trygetc();

    if (c >= 0)
        return c;

    c = serial_poll();
    if (c < 0)
        return -1;
    if (c == 27)
        return decode_serial_escape();
    if (c == 127)
        return '\b';                /* most terminals send DEL for backspace */
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
