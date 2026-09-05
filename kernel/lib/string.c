/* Minimal freestanding C string/memory routines. */
#include <kernel/string.h>

/*
 * memcpy and memset move whole frames and framebuffers around, so they use
 * the string instructions and work a dword at a time.  Copying byte by byte
 * here costs more than every other part of drawing a frame put together.
 */
void *memset(void *dst, int c, size_t n)
{
    void    *result = dst;
    uint8_t  value = (uint8_t)c;
    uint32_t pattern = (uint32_t)value * 0x01010101u;
    size_t   words = n / 4;
    size_t   bytes = n % 4;

    __asm__ volatile("cld; rep stosl"
                     : "+D"(dst), "+c"(words)
                     : "a"(pattern)
                     : "memory");
    __asm__ volatile("rep stosb"
                     : "+D"(dst), "+c"(bytes)
                     : "a"(pattern)
                     : "memory");
    return result;
}

void *memcpy(void *dst, const void *src, size_t n)
{
    void  *result = dst;
    size_t words = n / 4;
    size_t bytes = n % 4;

    __asm__ volatile("cld; rep movsl"
                     : "+D"(dst), "+S"(src), "+c"(words)
                     :
                     : "memory");
    __asm__ volatile("rep movsb"
                     : "+D"(dst), "+S"(src), "+c"(bytes)
                     :
                     : "memory");
    return result;
}

void *memmove(void *dst, const void *src, size_t n)
{
    uint8_t *d = (uint8_t *)dst;
    const uint8_t *s = (const uint8_t *)src;

    if (d == s || n == 0)
        return dst;

    if (d < s) {
        while (n--)
            *d++ = *s++;
    } else {
        d += n;
        s += n;
        while (n--)
            *--d = *--s;
    }
    return dst;
}

int memcmp(const void *a, const void *b, size_t n)
{
    const uint8_t *x = (const uint8_t *)a;
    const uint8_t *y = (const uint8_t *)b;
    while (n--) {
        if (*x != *y)
            return (int)*x - (int)*y;
        x++;
        y++;
    }
    return 0;
}

size_t strlen(const char *s)
{
    size_t n = 0;
    while (s[n])
        n++;
    return n;
}

size_t strnlen(const char *s, size_t max)
{
    size_t n = 0;
    while (n < max && s[n])
        n++;
    return n;
}

int strcmp(const char *a, const char *b)
{
    while (*a && *a == *b) {
        a++;
        b++;
    }
    return (int)(uint8_t)*a - (int)(uint8_t)*b;
}

int strncmp(const char *a, const char *b, size_t n)
{
    while (n && *a && *a == *b) {
        a++;
        b++;
        n--;
    }
    if (n == 0)
        return 0;
    return (int)(uint8_t)*a - (int)(uint8_t)*b;
}

static char lower(char c)
{
    return (c >= 'A' && c <= 'Z') ? (char)(c + 32) : c;
}

int strcasecmp(const char *a, const char *b)
{
    while (*a && lower(*a) == lower(*b)) {
        a++;
        b++;
    }
    return (int)(uint8_t)lower(*a) - (int)(uint8_t)lower(*b);
}

char *strcpy(char *dst, const char *src)
{
    char *out = dst;
    while ((*dst++ = *src++))
        ;
    return out;
}

char *strncpy(char *dst, const char *src, size_t n)
{
    size_t i = 0;
    for (; i < n && src[i]; i++)
        dst[i] = src[i];
    for (; i < n; i++)
        dst[i] = '\0';
    return dst;
}

/* Always NUL terminates; returns the length it wanted to write. */
size_t strlcpy(char *dst, const char *src, size_t size)
{
    size_t len = strlen(src);
    if (size) {
        size_t copy = (len >= size) ? size - 1 : len;
        memcpy(dst, src, copy);
        dst[copy] = '\0';
    }
    return len;
}

char *strcat(char *dst, const char *src)
{
    strcpy(dst + strlen(dst), src);
    return dst;
}

char *strchr(const char *s, int c)
{
    for (; *s; s++) {
        if (*s == (char)c)
            return (char *)s;
    }
    return (c == 0) ? (char *)s : NULL;
}

char *strrchr(const char *s, int c)
{
    const char *hit = NULL;
    for (; *s; s++) {
        if (*s == (char)c)
            hit = s;
    }
    return (char *)hit;
}

int atoi(const char *s)
{
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
