#ifndef _SYS_GUI_H
#define _SYS_GUI_H

/*
 * The window system interface, shared by the kernel window server and the
 * user space toolkit.
 *
 * An application asks for a window, gets a pixel buffer mapped into its own
 * address space, draws whatever it likes into it and tells the server which
 * part changed.  Input arrives as events on a per-window queue.
 */

#define GUI_MAX_TITLE   48
#define GUI_MAX_WINDOWS 32

/* Window flags */
#define GUI_NORMAL      0x00
#define GUI_NODECOR     0x01    /* no title bar or border */
#define GUI_BOTTOM      0x02    /* sits behind everything (the wallpaper) */
#define GUI_TOP         0x04    /* stays above normal windows (the taskbar) */
#define GUI_FIXED       0x08    /* cannot be resized by the user */
#define GUI_NOTASKBAR   0x10    /* do not show in the taskbar */

/* Window state */
#define GUI_STATE_NORMAL    0
#define GUI_STATE_MINIMIZED 1
#define GUI_STATE_MAXIMIZED 2

/* Event types */
#define GUI_EVENT_NONE       0
#define GUI_EVENT_MOUSE_MOVE 1
#define GUI_EVENT_MOUSE_DOWN 2
#define GUI_EVENT_MOUSE_UP   3
#define GUI_EVENT_WHEEL      4
#define GUI_EVENT_KEY        5
#define GUI_EVENT_CLOSE      6
#define GUI_EVENT_RESIZE     7
#define GUI_EVENT_FOCUS      8
#define GUI_EVENT_BLUR       9

struct gui_event {
    unsigned int type;
    unsigned int window;
    int          x, y;              /* window relative for mouse events */
    unsigned int buttons;
    int          button;
    int          wheel;
    unsigned int key;
    unsigned int width, height;     /* for resize events */
};

struct gui_window_info {
    unsigned int id;
    unsigned int width, height;
    unsigned int stride;            /* pixels per row */
    unsigned int buffer;            /* address of the pixels in this process */
    unsigned int flags;
    int          x, y;
};

struct gui_window_desc {
    unsigned int id;
    unsigned int pid;
    unsigned int flags;
    unsigned int state;
    unsigned int focused;
    char         title[GUI_MAX_TITLE];
};

/* Keys that have no ASCII value, matching the kernel's key codes. */
#define GUI_KEY_UP     0x100
#define GUI_KEY_DOWN   0x101
#define GUI_KEY_LEFT   0x102
#define GUI_KEY_RIGHT  0x103
#define GUI_KEY_HOME   0x104
#define GUI_KEY_END    0x105
#define GUI_KEY_DELETE 0x106
#define GUI_KEY_PGUP   0x107
#define GUI_KEY_PGDN   0x108
#define GUI_KEY_ESCAPE 27
#define GUI_KEY_ENTER  '\n'
#define GUI_KEY_TAB    '\t'
#define GUI_KEY_BACK   '\b'

struct gui_screen_info {
    unsigned int width, height;
};

#endif
