/*
 * libsifar implementation: thin wrappers over int 0x80, a heap built on
 * sbrk, and the handful of string and formatting routines every program
 * needs.
 */
#include "sifar.h"

int syscall3(int number, int a, int b, int c) {
  int result;

  __asm__ volatile("int $0x80"
                   : "=a"(result)
                   : "a"(number), "b"(a), "c"(b), "d"(c)
                   : "memory");
  return result;
}

/* ------------------------------------------------------------- process */

void exit(int code) {
  syscall3(SYS_EXIT, code, 0, 0);
  for (;;)
    ;
}

int getpid(void) { return syscall3(SYS_GETPID, 0, 0, 0); }
void yield(void) { syscall3(SYS_YIELD, 0, 0, 0); }
void sleep_ms(int ms) { syscall3(SYS_SLEEP, ms, 0, 0); }
int uptime_ms(void) { return syscall3(SYS_UPTIME, 0, 0, 0); }
int kill_process(int pid) { return syscall3(SYS_KILL, pid, 0, 0); }

int spawn(const char *path, int argc, const char *const *argv) {
  return syscall3(SYS_SPAWN, (int)path, (int)argv, argc);
}

int wait_for(int pid) { return syscall3(SYS_WAIT, pid, 0, 0); }

int try_wait(int pid, int *status) {
  int result = syscall3(SYS_WAIT, pid, 1, 0);

  if (result == -1000)
    return 0; /* still running */
  if (result == -1)
    return -1; /* no such process */
  if (status)
    *status = result;
  return 1;
}

int process_list(struct sys_proc *out, int max) {
  return syscall3(SYS_PROCLIST, (int)out, max, 0);
}

int system_info(struct sys_info *out) {
  return syscall3(SYS_SYSINFO, (int)out, 0, 0);
}

int system_time(struct sys_time *out) {
  return syscall3(SYS_TIME, (int)out, 0, 0);
}

int kernel_log(char *out, int max) {
  return syscall3(SYS_LOG, (int)out, max, 0);
}

void reboot(void) {
  syscall3(SYS_REBOOT, 0, 0, 0);
  for (;;)
    ;
}

void shutdown(void) {
  syscall3(SYS_SHUTDOWN, 0, 0, 0);
  for (;;)
    ;
}

/* ------------------------------------------------------------- console */

int write(int fd, const void *buffer, size_t length) {
  return syscall3(SYS_WRITE, fd, (int)buffer, (int)length);
}

int read_line(char *buffer, size_t length) {
  return syscall3(SYS_READ, 0, (int)buffer, (int)length);
}

void putchar(char c) { syscall3(SYS_PUTC, (int)(unsigned char)c, 0, 0); }

void puts(const char *text) { write(1, text, strlen(text)); }

/* ---------------------------------------------------------------- files */

int file_read(const char *path, void *buffer, size_t length) {
  return syscall3(SYS_FS_READ, (int)path, (int)buffer, (int)length);
}

int file_write(const char *path, const void *buffer, size_t length) {
  return syscall3(SYS_FS_WRITE, (int)path, (int)buffer, (int)length);
}

int file_append(const char *path, const void *buffer, size_t length) {
  return syscall3(SYS_FS_APPEND, (int)path, (int)buffer, (int)length);
}

int file_stat(const char *path, struct sys_stat *out) {
  return syscall3(SYS_STAT, (int)path, (int)out, 0);
}

int file_delete(const char *path) {
  return syscall3(SYS_UNLINK, (int)path, 0, 0);
}

int make_directory(const char *path) {
  return syscall3(SYS_MKDIR, (int)path, 0, 0);
}

int list_directory(const char *path, struct sys_dirent *out, int max) {
  return syscall3(SYS_OPENDIR, (int)path, (int)out, max);
}

int change_directory(const char *path) {
  return syscall3(SYS_CHDIR, (int)path, 0, 0);
}

int working_directory(char *out, size_t length) {
  return syscall3(SYS_GETCWD, (int)out, (int)length, 0);
}

/* --------------------------------------------------------------- network */

int network_info(struct net_info *out) {
  return syscall3(SYS_NET_INFO, (int)out, 0, 0);
}

int http_get(const char *host, uint16_t port, const char *path, void *out,
             size_t capacity) {
  struct net_http_request request;

  if (!host || !path || !out || !port || capacity == 0 ||
      capacity > NET_HTTP_MAX)
    return -1;
  memset(&request, 0, sizeof(request));
  if (strlcpy(request.host, host, sizeof(request.host)) >=
          sizeof(request.host) ||
      strlcpy(request.path, path, sizeof(request.path)) >= sizeof(request.path))
    return -1;
  request.port = port;
  return syscall3(SYS_HTTP_GET, (int)&request, (int)out, (int)capacity);
}

/* ----------------------------------------------------------------- heap */

/*
 * A first fit free list over memory obtained with sbrk.  Blocks carry a
 * header with their size and a magic number so a corrupted pointer is caught
 * at free time rather than silently wrecking the heap.
 */
#define HEAP_MAGIC 0x5346424Cu /* "SFBL" */

struct block {
  uint32_t magic;
  size_t size;
  struct block *next;
  uint32_t free;
};

static struct block *heap_head;

static void *sbrk(int increment) {
  int result = syscall3(SYS_SBRK, increment, 0, 0);

  return (result == 0) ? NULL : (void *)result;
}

static struct block *grow_heap(size_t size) {
  size_t total = size + sizeof(struct block);
  size_t chunk = (total + 0xFFFF) & ~0xFFFFu; /* 64 KiB granularity */
  struct block *block = (struct block *)sbrk((int)chunk);

  if (!block)
    return NULL;

  block->magic = HEAP_MAGIC;
  block->size = chunk - sizeof(struct block);
  block->free = 1;
  block->next = NULL;

  if (!heap_head) {
    heap_head = block;
  } else {
    struct block *last = heap_head;

    while (last->next)
      last = last->next;
    last->next = block;
  }
  return block;
}

void *malloc(size_t size) {
  struct block *block;

  if (size == 0)
    return NULL;
  size = (size + 7) & ~7u;

  for (block = heap_head; block; block = block->next) {
    if (block->free && block->size >= size)
      break;
  }
  if (!block)
    block = grow_heap(size);
  if (!block)
    return NULL;

  /* Split when the leftover is worth tracking. */
  if (block->size >= size + sizeof(struct block) + 32) {
    struct block *rest =
        (struct block *)((uint8_t *)block + sizeof(struct block) + size);

    rest->magic = HEAP_MAGIC;
    rest->size = block->size - size - sizeof(struct block);
    rest->free = 1;
    rest->next = block->next;
    block->next = rest;
    block->size = size;
  }

  block->free = 0;
  return (uint8_t *)block + sizeof(struct block);
}

void free(void *pointer) {
  struct block *block;

  if (!pointer)
    return;

  block = (struct block *)((uint8_t *)pointer - sizeof(struct block));
  if (block->magic != HEAP_MAGIC)
    return;
  block->free = 1;

  /* Merge with the following block when it is also free. */
  while (block->next && block->next->free) {
    block->size += sizeof(struct block) + block->next->size;
    block->next = block->next->next;
  }
}

void *calloc(size_t count, size_t size) {
  void *pointer = malloc(count * size);

  if (pointer)
    memset(pointer, 0, count * size);
  return pointer;
}

void *realloc(void *pointer, size_t size) {
  struct block *block;
  void *fresh;

  if (!pointer)
    return malloc(size);
  if (size == 0) {
    free(pointer);
    return NULL;
  }

  block = (struct block *)((uint8_t *)pointer - sizeof(struct block));
  if (block->magic != HEAP_MAGIC)
    return NULL;
  if (block->size >= size)
    return pointer;

  fresh = malloc(size);
  if (!fresh)
    return NULL;
  memcpy(fresh, pointer, block->size);
  free(pointer);
  return fresh;
}

/* -------------------------------------------------------------- strings */

size_t strlen(const char *s) {
  size_t n = 0;

  while (s[n])
    n++;
  return n;
}

int strcmp(const char *a, const char *b) {
  while (*a && *a == *b) {
    a++;
    b++;
  }
  return (int)(uint8_t)*a - (int)(uint8_t)*b;
}

int strncmp(const char *a, const char *b, size_t n) {
  while (n && *a && *a == *b) {
    a++;
    b++;
    n--;
  }
  return n ? (int)(uint8_t)*a - (int)(uint8_t)*b : 0;
}

char *strcpy(char *dst, const char *src) {
  char *out = dst;

  while ((*dst++ = *src++))
    ;
  return out;
}

size_t strlcpy(char *dst, const char *src, size_t size) {
  size_t length = strlen(src);

  if (size) {
    size_t copy = (length >= size) ? size - 1 : length;

    memcpy(dst, src, copy);
    dst[copy] = '\0';
  }
  return length;
}

char *strcat(char *dst, const char *src) {
  strcpy(dst + strlen(dst), src);
  return dst;
}

char *strchr(const char *s, int c) {
  for (; *s; s++) {
    if (*s == (char)c)
      return (char *)s;
  }
  return (c == 0) ? (char *)s : NULL;
}

char *strrchr(const char *s, int c) {
  const char *hit = NULL;

  for (; *s; s++) {
    if (*s == (char)c)
      hit = s;
  }
  return (char *)hit;
}

int atoi(const char *s) {
  int sign = 1;
  int value = 0;

  while (*s == ' ' || *s == '\t')
    s++;
  if (*s == '-') {
    sign = -1;
    s++;
  } else if (*s == '+') {
    s++;
  }
  while (*s >= '0' && *s <= '9')
    value = value * 10 + (*s++ - '0');
  return sign * value;
}

void *memset(void *dst, int value, size_t n) {
  uint8_t *p = (uint8_t *)dst;

  while (n--)
    *p++ = (uint8_t)value;
  return dst;
}

void *memcpy(void *dst, const void *src, size_t n) {
  void *result = dst;
  size_t words = n / 4;
  size_t bytes = n % 4;

  __asm__ volatile("cld; rep movsl"
                   : "+D"(dst), "+S"(src), "+c"(words)::"memory");
  __asm__ volatile("rep movsb" : "+D"(dst), "+S"(src), "+c"(bytes)::"memory");
  return result;
}

void *memmove(void *dst, const void *src, size_t n) {
  uint8_t *d = (uint8_t *)dst;
  const uint8_t *s = (const uint8_t *)src;

  if (d == s || n == 0)
    return dst;
  if (d < s)
    return memcpy(dst, src, n);

  d += n;
  s += n;
  while (n--)
    *--d = *--s;
  return dst;
}

int memcmp(const void *a, const void *b, size_t n) {
  const uint8_t *x = a, *y = b;

  while (n--) {
    if (*x != *y)
      return (int)*x - (int)*y;
    x++;
    y++;
  }
  return 0;
}

/* ------------------------------------------------------------ formatting */

struct format_sink {
  char *buffer;
  size_t size;
  size_t written;
};

static void sink_putc(struct format_sink *sink, char c) {
  if (sink->buffer) {
    if (sink->written + 1 < sink->size)
      sink->buffer[sink->written] = c;
  } else {
    putchar(c);
  }
  sink->written++;
}

static void sink_number(struct format_sink *sink, uint32_t value, int base,
                        int is_signed, int width, char pad) {
  const char *digits = "0123456789abcdef";
  char tmp[16];
  int count = 0;

  if (is_signed && (int)value < 0) {
    sink_putc(sink, '-');
    value = (uint32_t)(-(int)value);
    if (width)
      width--;
  }
  do {
    tmp[count++] = digits[value % (uint32_t)base];
    value /= (uint32_t)base;
  } while (value);

  for (int i = count; i < width; i++)
    sink_putc(sink, pad);
  while (count--)
    sink_putc(sink, tmp[count]);
}

static void format(struct format_sink *sink, const char *fmt, va_list ap) {
  for (; *fmt; fmt++) {
    int width = 0;
    char pad = ' ';

    if (*fmt != '%') {
      sink_putc(sink, *fmt);
      continue;
    }
    fmt++;
    if (*fmt == '0') {
      pad = '0';
      fmt++;
    }
    while (*fmt >= '0' && *fmt <= '9')
      width = width * 10 + (*fmt++ - '0');

    switch (*fmt) {
    case 's': {
      const char *text = va_arg(ap, const char *);
      int length;

      if (!text)
        text = "(null)";
      length = (int)strlen(text);
      for (int i = length; i < width; i++)
        sink_putc(sink, ' ');
      while (*text)
        sink_putc(sink, *text++);
      break;
    }
    case 'd':
    case 'i':
      sink_number(sink, (uint32_t)va_arg(ap, int), 10, 1, width, pad);
      break;
    case 'u':
      sink_number(sink, va_arg(ap, uint32_t), 10, 0, width, pad);
      break;
    case 'x':
      sink_number(sink, va_arg(ap, uint32_t), 16, 0, width, pad);
      break;
    case 'c':
      sink_putc(sink, (char)va_arg(ap, int));
      break;
    case '%':
      sink_putc(sink, '%');
      break;
    default:
      sink_putc(sink, '%');
      sink_putc(sink, *fmt);
      break;
    }
  }
}

void printf(const char *fmt, ...) {
  struct format_sink sink = {NULL, 0, 0};
  va_list ap;

  va_start(ap, fmt);
  format(&sink, fmt, ap);
  va_end(ap);
}

int snprintf(char *buffer, size_t size, const char *fmt, ...) {
  struct format_sink sink = {buffer, size, 0};
  va_list ap;

  va_start(ap, fmt);
  format(&sink, fmt, ap);
  va_end(ap);

  if (size)
    buffer[sink.written < size ? sink.written : size - 1] = '\0';
  return (int)sink.written;
}
