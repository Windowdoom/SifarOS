/*
 * 16550 UART driver for COM1.  The serial line doubles as a console so the
 * system can be driven headlessly (that is how the automated tests talk to it).
 */
#include <kernel/console.h>
#include <kernel/io.h>

#define COM1        0x3F8
#define REG_DATA    0
#define REG_IER     1
#define REG_FCR     2
#define REG_LCR     3
#define REG_MCR     4
#define REG_LSR     5

#define LSR_TX_EMPTY 0x20
#define LSR_RX_READY 0x01

static int present;

void serial_init(void)
{
    outb(COM1 + REG_IER, 0x00);     /* interrupts off while we configure */
    outb(COM1 + REG_LCR, 0x80);     /* DLAB: divisor latch accessible */
    outb(COM1 + 0, 0x01);           /* divisor low  -> 115200 baud */
    outb(COM1 + 1, 0x00);           /* divisor high */
    outb(COM1 + REG_LCR, 0x03);     /* 8 bits, no parity, one stop bit */
    outb(COM1 + REG_FCR, 0xC7);     /* enable + clear FIFOs, 14 byte trigger */
    outb(COM1 + REG_MCR, 0x0B);     /* DTR + RTS + OUT2 */

    /* Loopback test: if what we write comes back, a UART is really there. */
    outb(COM1 + REG_MCR, 0x1E);
    outb(COM1 + REG_DATA, 0xAE);
    present = (inb(COM1 + REG_DATA) == 0xAE);
    outb(COM1 + REG_MCR, 0x0B);
}

static void wait_tx(void)
{
    int spin = 100000;
    while (!(inb(COM1 + REG_LSR) & LSR_TX_EMPTY) && spin--)
        ;
}

void serial_putc(char c)
{
    if (!present)
        return;
    if (c == '\n') {
        wait_tx();
        outb(COM1 + REG_DATA, '\r');
    }
    wait_tx();
    outb(COM1 + REG_DATA, (uint8_t)c);
}

void serial_write(const char *s, size_t n)
{
    while (n--)
        serial_putc(*s++);
}

int serial_poll(void)
{
    if (!present)
        return -1;
    if (!(inb(COM1 + REG_LSR) & LSR_RX_READY))
        return -1;
    return inb(COM1 + REG_DATA);
}
