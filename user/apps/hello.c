/*
 * A ring 3 program that talks to the kernel only through system calls.
 */
#include "sifar.h"

int main(int argc, char **argv)
{
    char buffer[64];
    int  pid = getpid();
    int  start = uptime_ms();
    long sum = 0;

    printf("hello: running in ring 3 as process %d\n", pid);
    if (argc > 1) {
        printf("hello: arguments:");
        for (int i = 1; i < argc; i++)
            printf(" %s", argv[i]);
        printf("\n");
    }

    for (int i = 1; i <= 1000; i++)
        sum += i;
    printf("hello: sum of 1..1000 = %d (computed in user space)\n", (int)sum);

    const char *note = "written from ring 3 by hello\n";
    if (file_write("/home/hello.txt", note, strlen(note)) > 0) {
        int n = file_read("/home/hello.txt", buffer, sizeof(buffer) - 1);

        if (n > 0) {
            buffer[n] = '\0';
            printf("hello: read back /home/hello.txt -> %s", buffer);
        }
    }

    {
        void *block = malloc(4096);

        if (block) {
            memset(block, 0xAB, 4096);
            printf("hello: allocated and touched 4 KiB of heap at %x\n", (uint32_t)block);
            free(block);
        }
    }

    printf("hello: done after %d ms, exiting with status 7\n", uptime_ms() - start);
    return 7;
}
