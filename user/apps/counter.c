/*
 * Sleeps between lines so you can watch the kernel schedule other threads
 * while this one is blocked.
 */
#include "sifar.h"

int main(int argc, char **argv)
{
    for (int i = 1; i <= 5; i++) {
        printf("counter: tick %d of 5 at %d ms\n", i, uptime_ms());
        sleep_ms(200);
    }
    puts("counter: finished\n");
    return 0;
}
