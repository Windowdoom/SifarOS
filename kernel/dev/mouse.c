/*
 * PS/2 mouse.
 *
 * The controller delivers three byte packets on IRQ12 (four once the wheel is
 * enabled).  The driver keeps an absolute cursor position clamped to the
 * screen and turns packets into events the window system can consume.
 */
#include <kernel/input.h>
#include <kernel/adaptive.h>
#include <kernel/console.h>
#include <kernel/kprintf.h>
#include <kernel/io.h>
#include <arch/x86.h>

#define PS2_DATA    0x60
#define PS2_STATUS  0x64
#define PS2_COMMAND 0x64

#define EVENT_QUEUE 128

static struct input_event queue[EVENT_QUEUE];
static volatile uint32_t  head, tail;

static uint8_t  packet[4];
static int      packet_index;
static int      packet_size = 3;
static int      present;

static int      cursor_x, cursor_y;
static int      bound_w = 1024, bound_h = 768;
static uint32_t button_state;

static void wait_write(void)
{
    int spin = 100000;

    while (spin-- && (inb(PS2_STATUS) & 0x02))
        ;
}

static void wait_read(void)
{
    int spin = 100000;

    while (spin-- && !(inb(PS2_STATUS) & 0x01))
        ;
}

static void controller_command(uint8_t command)
{
    wait_write();
    outb(PS2_COMMAND, command);
}

static void mouse_write(uint8_t value)
{
    controller_command(0xD4);       /* the next byte goes to the mouse */
    wait_write();
    outb(PS2_DATA, value);
}

static uint8_t mouse_read(void)
{
    wait_read();
    return inb(PS2_DATA);
}

static void push(const struct input_event *event)
{
    uint32_t next = (head + 1) % EVENT_QUEUE;

    if (next == tail)
        return;                     /* full: drop the oldest news */
    queue[head] = *event;
    head = next;
}

void input_push_key(uint32_t key)
{
    struct input_event event = { 0 };

    event.kind = INPUT_KEY;
    event.key = key;
    event.x = cursor_x;
    event.y = cursor_y;
    event.buttons = button_state;
    push(&event);
}

int input_poll(struct input_event *out)
{
    uint32_t flags = irq_save();
    int      got = 0;

    if (tail != head) {
        *out = queue[tail];
        tail = (tail + 1) % EVENT_QUEUE;
        got = 1;
    }
    irq_restore(flags);

    /* Interaction is observed when the window server consumes an event rather
     * than from IRQ context. This keeps the adaptive path out of the driver ISR
     * while still covering keyboard, mouse, button and wheel activity. */
    if (got)
        adaptive_note_interaction();
    return got;
}

int input_pending(void)
{
    return head != tail;
}

static volatile int32_t total_dx, total_dy;
static volatile uint8_t last_packet[4];
static volatile uint32_t dropped;

static void handle_packet(void)
{
    for (int i = 0; i < 4; i++)
        last_packet[i] = packet[i];

    uint8_t flags = packet[0];
    int     dx, dy, wheel = 0;
    uint32_t buttons = 0;
    struct input_event event = { 0 };

    if (!(flags & 0x08)) {
        dropped++;
        return;                     /* bit 3 is always set in a valid packet */
    }
    if (flags & 0xC0) {
        dropped++;
        return;                     /* overflow, throw the packet away */
    }

    dx = packet[1];
    dy = packet[2];
    if (flags & 0x10)
        dx |= 0xFFFFFF00;           /* sign extend */
    if (flags & 0x20)
        dy |= 0xFFFFFF00;

    if (packet_size == 4) {
        int8_t z = (int8_t)(packet[3] & 0x0F);

        if (z & 0x08)
            z |= (int8_t)0xF0;
        wheel = -z;
    }

    if (flags & 0x01) buttons |= MOUSE_LEFT;
    if (flags & 0x02) buttons |= MOUSE_RIGHT;
    if (flags & 0x04) buttons |= MOUSE_MIDDLE;

    total_dx += dx;
    total_dy += dy;
    cursor_x += dx;
    cursor_y -= dy;                 /* the mouse reports y growing upward */
    if (cursor_x < 0) cursor_x = 0;
    if (cursor_y < 0) cursor_y = 0;
    if (cursor_x > bound_w - 1) cursor_x = bound_w - 1;
    if (cursor_y > bound_h - 1) cursor_y = bound_h - 1;

    event.x = cursor_x;
    event.y = cursor_y;
    event.dx = dx;
    event.dy = -dy;
    event.buttons = buttons;

    if (dx || dy) {
        event.kind = INPUT_MOUSE_MOVE;
        push(&event);
    }

    for (uint32_t bit = 1; bit <= MOUSE_MIDDLE; bit <<= 1) {
        if ((buttons & bit) && !(button_state & bit)) {
            event.kind = INPUT_MOUSE_DOWN;
            event.button = (int32_t)bit;
            push(&event);
        } else if (!(buttons & bit) && (button_state & bit)) {
            event.kind = INPUT_MOUSE_UP;
            event.button = (int32_t)bit;
            push(&event);
        }
    }
    event.button = 0;

    if (wheel) {
        event.kind = INPUT_MOUSE_WHEEL;
        event.wheel = wheel;
        push(&event);
    }

    button_state = buttons;
}

static volatile uint32_t irq_count;
static volatile uint32_t packet_count;
static volatile uint32_t stray_bytes;
static volatile uint32_t resyncs;

/*
 * Both PS/2 devices deliver their bytes through the same data port, so
 * whichever interrupt fires has to look at the status register to see who the
 * byte belongs to and hand it to the right driver.  Getting this wrong
 * desynchronises the mouse packet stream the moment someone types.
 */
void mouse_feed_byte(uint8_t byte)
{
    /*
     * Bit 3 of the first byte of a packet is always set.  If it is not, the
     * stream has lost sync (a byte was dropped somewhere), so throw this one
     * away rather than misreading every packet from here on.
     */
    if (packet_index == 0 && !(byte & 0x08)) {
        resyncs++;
        return;
    }

    packet[packet_index++] = byte;

    if (packet_index >= packet_size) {
        packet_index = 0;
        packet_count++;
        handle_packet();
    }
}

static void mouse_irq(struct registers *regs)
{
    (void)regs;
    irq_count++;

    while (1) {
        uint8_t status = inb(PS2_STATUS);

        if (!(status & 0x01))
            break;
        if (status & 0x20) {
            mouse_feed_byte(inb(PS2_DATA));
        } else {
            keyboard_feed_byte(inb(PS2_DATA));
            stray_bytes++;
        }
    }
}

void mouse_debug(uint32_t *irqs, uint32_t *packets, int *x, int *y, uint32_t *buttons)
{
    if (irqs) *irqs = irq_count;
    (void)stray_bytes;
    (void)resyncs;
    if (packets) *packets = packet_count;
    if (x) *x = cursor_x;
    if (y) *y = cursor_y;
    if (buttons) *buttons = button_state;
}

void mouse_debug_raw(int32_t *dx, int32_t *dy, uint32_t *drops, uint8_t *packet_out)
{
    if (dx) *dx = total_dx;
    if (dy) *dy = total_dy;
    if (drops) *drops = dropped;
    if (packet_out) {
        for (int i = 0; i < 4; i++)
            packet_out[i] = last_packet[i];
    }
}

void mouse_set_bounds(int width, int height)
{
    bound_w = width;
    bound_h = height;
    cursor_x = width / 2;
    cursor_y = height / 2;
}

void mouse_position(int *x, int *y, uint32_t *buttons)
{
    if (x) *x = cursor_x;
    if (y) *y = cursor_y;
    if (buttons) *buttons = button_state;
}


int mouse_present(void)
{
    return present;
}

/* Ask for the wheel by playing the magic sample rate sequence. */
static int enable_wheel(void)
{
    static const uint8_t rates[] = { 200, 100, 80 };

    for (int i = 0; i < 3; i++) {
        mouse_write(0xF3);
        mouse_read();
        mouse_write(rates[i]);
        mouse_read();
    }

    mouse_write(0xF2);              /* read device id */
    mouse_read();
    return mouse_read() == 0x03;
}

void mouse_init(void)
{
    uint8_t status;

    controller_command(0xA8);       /* enable the auxiliary device */

    controller_command(0x20);       /* read the controller configuration */
    status = mouse_read();
    status |= 0x02;                 /* IRQ12 on */
    status &= (uint8_t)~0x20;       /* clock the mouse port */
    controller_command(0x60);
    wait_write();
    outb(PS2_DATA, status);

    mouse_write(0xF6);              /* restore defaults */
    if (mouse_read() != 0xFA)
        return;

    packet_size = enable_wheel() ? 4 : 3;

    mouse_write(0xF4);              /* start reporting */
    if (mouse_read() != 0xFA)
        return;

    present = 1;
    packet_index = 0;

    isr_register(IRQ_BASE + 12, mouse_irq);
    pic_unmask_irq(2);              /* the cascade line to the second PIC */
    pic_unmask_irq(12);
}
