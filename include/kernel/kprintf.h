#ifndef _KERNEL_KPRINTF_H
#define _KERNEL_KPRINTF_H

#include <kernel/types.h>

int  kprintf(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
int  kvsnprintf(char *buf, size_t size, const char *fmt, va_list ap);
int  ksnprintf(char *buf, size_t size, const char *fmt, ...)
        __attribute__((format(printf, 3, 4)));

void panic(const char *fmt, ...) __attribute__((noreturn, format(printf, 1, 2)));

#endif
