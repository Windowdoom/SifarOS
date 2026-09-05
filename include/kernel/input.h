#ifndef _KERNEL_INPUT_H
#define _KERNEL_INPUT_H

#include <kernel/types.h>

#define MOUSE_LEFT   0x01
#define MOUSE_RIGHT  0x02
#define MOUSE_MIDDLE 0x04

enum input_kind {
    INPUT_NONE = 0,
    INPUT_MOUSE_MOVE,
    INPUT_MOUSE_DOWN,
    INPUT_MOUSE_UP,
    INPUT_MOUSE_WHEEL,
    INPUT_KEY,
};

struct input_event {
    uint32_t kind;
    int32_t  x, y;          /* absolute cursor position */
    int32_t  dx, dy;        /* movement since the last event */
    uint32_t buttons;       /* current button mask */
    int32_t  button;        /* the button that changed, for down/up */
    int32_t  wheel;         /* -1 or +1 for wheel events */
    uint32_t key;           /* key code for INPUT_KEY */
};

void mouse_init(void);
void mouse_feed_byte(uint8_t byte);      /* a byte the keyboard IRQ picked up */
void keyboard_feed_byte(uint8_t byte);   /* a byte the mouse IRQ picked up */
void mouse_set_bounds(int width, int height);
void mouse_position(int *x, int *y, uint32_t *buttons);
int  mouse_present(void);
void mouse_debug(uint32_t *irqs, uint32_t *packets, int *x, int *y, uint32_t *buttons);
void mouse_debug_raw(int32_t *dx, int32_t *dy, uint32_t *drops, uint8_t *packet_out);

/* Pull the next input event, or return 0 when the queue is empty. */
int  input_poll(struct input_event *out);
void input_push_key(uint32_t key);
int  input_pending(void);

#endif
