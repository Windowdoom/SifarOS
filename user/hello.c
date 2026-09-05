/*
 * A ring 3 program.  It can only reach the kernel through system calls, which
 * is the whole point of it existing.
 */
#include "ulib.h"

int main(void)
{
    char   buffer[64];
    int    pid = getpid();
    int    start = uptime_ms();
    long   sum = 0;

    printf("hello: running in ring 3 as thread %d\n", pid);
    printf("hello: uptime when I started was %d ms\n", start);

    for (int i = 1; i <= 1000; i++)
        sum += i;
    printf("hello: sum of 1..1000 = %d (computed in user space)\n", (int)sum);

    /* Files are reached through the kernel, never by touching its memory. */
    const char *note = "written from ring 3 by hello\n";
    if (file_write("/home/hello.txt", note, strlen(note)) > 0) {
        int n = file_read("/home/hello.txt", buffer, sizeof(buffer) - 1);
        if (n > 0) {
            buffer[n] = '\0';
            printf("hello: read back /home/hello.txt -> %s", buffer);
        }
    }

    printf("hello: yielding three times to prove the scheduler still owns me\n");
    for (int i = 0; i < 3; i++)
        yield();

    printf("hello: done after %d ms, exiting with status 7\n",
           uptime_ms() - start);
    return 7;
}
