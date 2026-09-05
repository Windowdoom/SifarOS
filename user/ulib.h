#ifndef _ULIB_H
#define _ULIB_H

/*
 * The whole of user-space's standard library.  Everything here goes through
 * int 0x80; a user program cannot touch hardware or kernel memory directly.
 */
#include <sys/syscall.h>

typedef unsigned int   size_t;
typedef unsigned char  uint8_t;
typedef unsigned int   uint32_t;
typedef int            int32_t;

#define NULL ((void *)0)

int  syscall3(int number, int a, int b, int c);

void exit(int code) __attribute__((noreturn));
int  write(int fd, const void *buf, size_t len);
int  read(int fd, void *buf, size_t len);
void putc(char c);
void puts(const char *s);
void printf(const char *fmt, ...);
void yield(void);
void sleep_ms(int ms);
int  getpid(void);
int  uptime_ms(void);
int  file_write(const char *path, const void *buf, size_t len);
int  file_read(const char *path, void *buf, size_t len);

size_t strlen(const char *s);

#endif
