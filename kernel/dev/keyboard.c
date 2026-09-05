/*
 * PS/2 keyboard driver (scancode set 1).
 *
 * The IRQ handler translates scancodes into characters and drops them into a
 * ring buffer; readers pull from the buffer so no keystroke is lost while the
 * shell is busy.
 */
#include <arch/x86.h>
#include <kernel/console.h>
#include <kernel/io.h>

#define KBD_DATA   0x60
#define KBD_STATUS 0x64

#define BUFFER_SIZE 128

static volatile uint16_t buffer[BUFFER_SIZE];
static volatile uint32_t head, tail;

static int shift_down;
static int ctrl_down;
static int caps_lock;
static int extended;

static const char map_lower[128] = {
    0,   27, '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', '\b',
    '\t','q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\n',
    0,   'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', '\'', '`',
    0,   '\\','z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/',
    0,   '*', 0,   ' ',
};

static const char map_upper[128] = {
    0,   27, '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '\b',
    '\t','Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '{', '}', '\n',
    0,   'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ':', '"', '~',
    0,   '|', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '<', '>', '?',
    0,   '*', 0,   ' ',
};

static void push(uint16_t key)
{
    uint32_t next = (head + 1) % BUFFER_SIZE;

    if (next == tail)
        return;             /* buffer full: drop the keystroke */
    buffer[head] = key;
    head = next;
}

static int is_letter(char c)
{
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}

static void keyboard_irq(struct registers *regs)
{
    uint8_t code = inb(KBD_DATA);
    int     released;

    (void)regs;

    if (code == 0xE0) {
        extended = 1;
        return;
    }

    released = (code & 0x80) != 0;
    code &= 0x7F;

    if (extended) {
        extended = 0;
        if (released)
            return;
        switch (code) {
        case 0x48: push(KEY_UP);     return;
        case 0x50: push(KEY_DOWN);   return;
        case 0x4B: push(KEY_LEFT);   return;
        case 0x4D: push(KEY_RIGHT);  return;
        case 0x47: push(KEY_HOME);   return;
        case 0x4F: push(KEY_END);    return;
        case 0x53: push(KEY_DELETE); return;
        case 0x49: push(KEY_PGUP);   return;
        case 0x51: push(KEY_PGDN);   return;
        case 0x1D: ctrl_down = 1;    return;
        default:                     return;
        }
    }

    switch (code) {
    case 0x2A:
    case 0x36:
        shift_down = !released;
        return;
    case 0x1D:
        ctrl_down = !released;
        return;
    case 0x3A:
        if (!released)
            caps_lock = !caps_lock;
        return;
    default:
        break;
    }

    if (released || code >= 128)
        return;

    {
        char c = shift_down ? map_upper[code] : map_lower[code];

        if (!c)
            return;
        if (caps_lock && is_letter(c))
            c = shift_down ? (char)(c + 32) : (char)(c - 32);
        if (ctrl_down && is_letter(c))
            c = (char)((c | 0x20) - 'a' + 1);   /* ^A == 1, ^C == 3, ... */
        push((uint16_t)(unsigned char)c);
    }
}

int keyboard_trygetc(void)
{
    uint32_t flags = irq_save();
    int      key = -1;

    if (tail != head) {
        key = buffer[tail];
        tail = (tail + 1) % BUFFER_SIZE;
    }
    irq_restore(flags);
    return key;
}

void keyboard_init(void)
{
    head = tail = 0;

    /* Drain anything the BIOS left behind. */
    while (inb(KBD_STATUS) & 0x01)
        (void)inb(KBD_DATA);

    isr_register(IRQ_BASE + IRQ_KEYBOARD, keyboard_irq);
    pic_unmask_irq(IRQ_KEYBOARD);
}
