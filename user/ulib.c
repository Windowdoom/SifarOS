/* User-space runtime: the syscall stubs and just enough formatting to be useful. */
#include "ulib.h"

typedef __builtin_va_list va_list;
#define va_start(v, l) __builtin_va_start(v, l)
#define va_arg(v, t)   __builtin_va_arg(v, t)
#define va_end(v)      __builtin_va_end(v)

int syscall3(int number, int a, int b, int c)
{
    int result;

    __asm__ volatile("int $0x80"
                     : "=a"(result)
                     : "a"(number), "b"(a), "c"(b), "d"(c)
                     : "memory");
    return result;
}

void exit(int code)
{
    syscall3(SYS_EXIT, code, 0, 0);
    for (;;)
        ;                           /* the kernel never schedules us again */
}

int write(int fd, const void *buf, size_t len)
{
    return syscall3(SYS_WRITE, fd, (int)buf, (int)len);
}

int read(int fd, void *buf, size_t len)
{
    return syscall3(SYS_READ, fd, (int)buf, (int)len);
}

void putc(char c)
{
    syscall3(SYS_PUTC, (int)(unsigned char)c, 0, 0);
}

size_t strlen(const char *s)
{
    size_t n = 0;

    while (s[n])
        n++;
    return n;
}

void puts(const char *s)
{
    write(1, s, strlen(s));
}

void yield(void)
{
    syscall3(SYS_YIELD, 0, 0, 0);
}

void sleep_ms(int ms)
{
    syscall3(SYS_SLEEP, ms, 0, 0);
}

int getpid(void)
{
    return syscall3(SYS_GETPID, 0, 0, 0);
}

int uptime_ms(void)
{
    return syscall3(SYS_UPTIME, 0, 0, 0);
}

int file_write(const char *path, const void *buf, size_t len)
{
    return syscall3(SYS_FS_WRITE, (int)path, (int)buf, (int)len);
}

int file_read(const char *path, void *buf, size_t len)
{
    return syscall3(SYS_FS_READ, (int)path, (int)buf, (int)len);
}

static void print_number(unsigned int value, int base, int is_signed)
{
    const char *digits = "0123456789abcdef";
    char tmp[16];
    int  i = 0;

    if (is_signed && (int)value < 0) {
        putc('-');
        value = (unsigned int)(-(int)value);
    }
    do {
        tmp[i++] = digits[value % (unsigned int)base];
        value /= (unsigned int)base;
    } while (value);
    while (i--)
        putc(tmp[i]);
}

/* %s %d %u %x %c %% - enough for a program to say what it is doing. */
void printf(const char *fmt, ...)
{
    va_list ap;

    va_start(ap, fmt);
    for (; *fmt; fmt++) {
        if (*fmt != '%') {
            putc(*fmt);
            continue;
        }
        switch (*++fmt) {
        case 's': puts(va_arg(ap, const char *));                break;
        case 'd': print_number((unsigned int)va_arg(ap, int), 10, 1); break;
        case 'u': print_number(va_arg(ap, unsigned int), 10, 0); break;
        case 'x': print_number(va_arg(ap, unsigned int), 16, 0); break;
        case 'c': putc((char)va_arg(ap, int));                   break;
        case '%': putc('%');                                     break;
        default:  putc('%'); putc(*fmt);                         break;
        }
    }
    va_end(ap);
}
