/*
 * A small printf for kernel use.  Supports:
 *   %c %s %d %i %u %x %X %o %p %% and the '0', '-', width and 'l' modifiers.
 */
#include <kernel/kprintf.h>
#include <kernel/console.h>
#include <kernel/string.h>
#include <kernel/io.h>

struct sink {
    char  *buf;      /* NULL means "write straight to the console" */
    size_t size;
    size_t written;  /* number of characters the format wanted to emit */
};

static void sink_putc(struct sink *s, char c)
{
    if (s->buf) {
        if (s->written + 1 < s->size)
            s->buf[s->written] = c;
    } else {
        console_putc(c);
    }
    s->written++;
}

static void sink_pad(struct sink *s, char pad, int count)
{
    while (count-- > 0)
        sink_putc(s, pad);
}

static void emit_string(struct sink *s, const char *str, int width, int left, char pad)
{
    int len = (int)strlen(str);
    if (!left)
        sink_pad(s, pad, width - len);
    while (*str)
        sink_putc(s, *str++);
    if (left)
        sink_pad(s, ' ', width - len);
}

static void emit_number(struct sink *s, uint32_t value, int base, int is_signed,
                        int upper, int width, int left, char pad)
{
    const char *digits = upper ? "0123456789ABCDEF" : "0123456789abcdef";
    char tmp[36];
    int  i = 0;
    int  negative = 0;

    if (is_signed && (int32_t)value < 0) {
        negative = 1;
        value = (uint32_t)(-(int32_t)value);
    }

    do {
        tmp[i++] = digits[value % (uint32_t)base];
        value /= (uint32_t)base;
    } while (value);

    if (negative)
        tmp[i++] = '-';

    int written = i;

    if (!left && pad == '0' && negative) {
        /* keep the sign in front of the zero padding */
        sink_putc(s, '-');
        i--;
        width--;
    }

    if (!left)
        sink_pad(s, pad, width - i);
    while (i--)
        sink_putc(s, tmp[i]);
    if (left)
        sink_pad(s, ' ', width - written);
}

static int format(struct sink *s, const char *fmt, va_list ap)
{
    for (; *fmt; fmt++) {
        if (*fmt != '%') {
            sink_putc(s, *fmt);
            continue;
        }

        fmt++;
        int  left = 0;
        char pad = ' ';
        int  width = 0;

        for (;;) {
            if (*fmt == '-') {
                left = 1;
                fmt++;
            } else if (*fmt == '0') {
                pad = '0';
                fmt++;
            } else {
                break;
            }
        }
        while (*fmt >= '0' && *fmt <= '9')
            width = width * 10 + (*fmt++ - '0');
        while (*fmt == 'l' || *fmt == 'z' || *fmt == 'h')
            fmt++;

        switch (*fmt) {
        case 'c':
            sink_putc(s, (char)va_arg(ap, int));
            break;
        case 's': {
            const char *str = va_arg(ap, const char *);
            emit_string(s, str ? str : "(null)", width, left, ' ');
            break;
        }
        case 'd':
        case 'i':
            emit_number(s, (uint32_t)va_arg(ap, int32_t), 10, 1, 0, width, left, pad);
            break;
        case 'u':
            emit_number(s, va_arg(ap, uint32_t), 10, 0, 0, width, left, pad);
            break;
        case 'x':
            emit_number(s, va_arg(ap, uint32_t), 16, 0, 0, width, left, pad);
            break;
        case 'X':
            emit_number(s, va_arg(ap, uint32_t), 16, 0, 1, width, left, pad);
            break;
        case 'o':
            emit_number(s, va_arg(ap, uint32_t), 8, 0, 0, width, left, pad);
            break;
        case 'p':
            sink_putc(s, '0');
            sink_putc(s, 'x');
            emit_number(s, (uint32_t)(uintptr_t)va_arg(ap, void *), 16, 0, 0, 8, 0, '0');
            break;
        case '%':
            sink_putc(s, '%');
            break;
        case '\0':
            return (int)s->written;
        default:
            sink_putc(s, '%');
            sink_putc(s, *fmt);
            break;
        }
    }
    return (int)s->written;
}

int kprintf(const char *fmt, ...)
{
    struct sink s = { NULL, 0, 0 };
    va_list ap;
    int n;

    va_start(ap, fmt);
    n = format(&s, fmt, ap);
    va_end(ap);
    return n;
}

int kvsnprintf(char *buf, size_t size, const char *fmt, va_list ap)
{
    struct sink s = { buf, size, 0 };
    int n = format(&s, fmt, ap);
    if (size)
        buf[MIN(s.written, size - 1)] = '\0';
    return n;
}

int ksnprintf(char *buf, size_t size, const char *fmt, ...)
{
    va_list ap;
    int n;

    va_start(ap, fmt);
    n = kvsnprintf(buf, size, fmt, ap);
    va_end(ap);
    return n;
}

void panic(const char *fmt, ...)
{
    va_list ap;

    cli();
    kprintf("\n*** KERNEL PANIC ***\n");
    va_start(ap, fmt);
    {
        char buf[256];
        kvsnprintf(buf, sizeof(buf), fmt, ap);
        kprintf("%s\n", buf);
    }
    va_end(ap);
    kprintf("System halted.\n");

    for (;;)
        hlt();
}
