#ifndef _SIFAR_H
#define _SIFAR_H

/*
 * libsifar: the user space runtime.
 *
 * Everything an application can do goes through these calls; there is no
 * other way into the kernel.
 */
#include <sys/syscall.h>
#include <sys/gui.h>
#include <sys/sysinfo.h>
#include <sys/net.h>

typedef unsigned int   size_t;
typedef unsigned char  uint8_t;
typedef unsigned short uint16_t;
typedef unsigned int   uint32_t;
typedef int            int32_t;
typedef unsigned long long uint64_t;

#define NULL ((void *)0)
#define true 1
#define false 0

typedef __builtin_va_list va_list;
#define va_start(v, l) __builtin_va_start(v, l)
#define va_arg(v, t)   __builtin_va_arg(v, t)
#define va_end(v)      __builtin_va_end(v)

/* ---- raw system calls ---- */
int syscall3(int number, int a, int b, int c);

/* ---- process ---- */
void exit(int code) __attribute__((noreturn));
int  getpid(void);
void yield(void);
void sleep_ms(int ms);
int  uptime_ms(void);
int  spawn(const char *path, int argc, const char *const *argv);
int  wait_for(int pid);                 /* blocks, returns the exit status */
int  try_wait(int pid, int *status);    /* 1 when finished, 0 when running */
int  kill_process(int pid);
int  process_list(struct sys_proc *out, int max);
int  system_info(struct sys_info *out);
int  system_time(struct sys_time *out);
int  kernel_log(char *out, int max);
void reboot(void) __attribute__((noreturn));
void shutdown(void) __attribute__((noreturn));

/* ---- console ---- */
int  write(int fd, const void *buffer, size_t length);
int  read_line(char *buffer, size_t length);
void putchar(char c);
void puts(const char *text);
void printf(const char *format, ...);

/* ---- files ---- */
int  file_read(const char *path, void *buffer, size_t length);
int  file_write(const char *path, const void *buffer, size_t length);
int  file_append(const char *path, const void *buffer, size_t length);
int  file_stat(const char *path, struct sys_stat *out);
int  file_delete(const char *path);
int  make_directory(const char *path);
int  list_directory(const char *path, struct sys_dirent *out, int max);
int  change_directory(const char *path);
int  working_directory(char *out, size_t length);

/* ---- network ---- */
int network_info(struct net_info *out);
int http_get(const char *host, uint16_t port, const char *path,
             void *out, size_t capacity);

/* ---- memory ---- */
void *malloc(size_t size);
void *calloc(size_t count, size_t size);
void *realloc(void *pointer, size_t size);
void  free(void *pointer);

/* ---- strings ---- */
size_t strlen(const char *s);
int    strcmp(const char *a, const char *b);
int    strncmp(const char *a, const char *b, size_t n);
char  *strcpy(char *dst, const char *src);
size_t strlcpy(char *dst, const char *src, size_t size);
char  *strcat(char *dst, const char *src);
char  *strchr(const char *s, int c);
char  *strrchr(const char *s, int c);
int    atoi(const char *s);
void  *memset(void *dst, int value, size_t n);
void  *memcpy(void *dst, const void *src, size_t n);
void  *memmove(void *dst, const void *src, size_t n);
int    memcmp(const void *a, const void *b, size_t n);
int    snprintf(char *buffer, size_t size, const char *format, ...);

#endif
