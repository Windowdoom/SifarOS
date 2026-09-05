/*
 * 8259A programmable interrupt controller.
 *
 * The BIOS leaves the PICs mapped over vectors 0..15, which collide with the
 * CPU exception vectors, so the first thing we do is remap them to 32..47.
 */
#include <arch/x86.h>
#include <kernel/io.h>

#define PIC1_CMD  0x20
#define PIC1_DATA 0x21
#define PIC2_CMD  0xA0
#define PIC2_DATA 0xA1

#define ICW1_INIT 0x11   /* edge triggered, cascade, expect ICW4 */
#define ICW4_8086 0x01
#define PIC_EOI   0x20

void pic_init(void)
{
    uint8_t mask1 = inb(PIC1_DATA);
    uint8_t mask2 = inb(PIC2_DATA);

    outb(PIC1_CMD, ICW1_INIT);      io_wait();
    outb(PIC2_CMD, ICW1_INIT);      io_wait();
    outb(PIC1_DATA, IRQ_BASE);      io_wait();      /* master -> 32..39 */
    outb(PIC2_DATA, IRQ_BASE + 8);  io_wait();      /* slave  -> 40..47 */
    outb(PIC1_DATA, 0x04);          io_wait();      /* slave is on IRQ2 */
    outb(PIC2_DATA, 0x02);          io_wait();      /* slave cascade id */
    outb(PIC1_DATA, ICW4_8086);     io_wait();
    outb(PIC2_DATA, ICW4_8086);     io_wait();

    (void)mask1;
    (void)mask2;

    /* Start with everything masked except the cascade line. */
    outb(PIC1_DATA, 0xFB);
    outb(PIC2_DATA, 0xFF);
}

void pic_send_eoi(uint8_t irq)
{
    if (irq >= 8)
        outb(PIC2_CMD, PIC_EOI);
    outb(PIC1_CMD, PIC_EOI);
}

void pic_mask_irq(uint8_t irq)
{
    uint16_t port = (irq < 8) ? PIC1_DATA : PIC2_DATA;
    uint8_t  bit  = (uint8_t)(1 << (irq & 7));
    outb(port, (uint8_t)(inb(port) | bit));
}

void pic_unmask_irq(uint8_t irq)
{
    uint16_t port = (irq < 8) ? PIC1_DATA : PIC2_DATA;
    uint8_t  bit  = (uint8_t)(1 << (irq & 7));
    outb(port, (uint8_t)(inb(port) & ~bit));
}
