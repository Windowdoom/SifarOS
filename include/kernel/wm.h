#ifndef _KERNEL_WM_H
#define _KERNEL_WM_H

#include <kernel/types.h>
#include <kernel/gfx.h>
#include <sys/gui.h>

/* Chrome dimensions, also used by the toolkit when it lays out a window. */
#define WM_TITLE_HEIGHT 26
#define WM_BORDER       1
#define WM_EVENT_QUEUE  32

struct process;

struct window {
    uint32_t          id;
    int               used;
    struct process   *owner;
    char              title[GUI_MAX_TITLE];
    int               x, y;
    int               width, height;        /* client area */
    uint32_t          flags;
    uint32_t          state;
    int               saved_x, saved_y, saved_w, saved_h;

    phys_addr_t       buffer_phys;
    uint32_t          buffer_pages;
    virt_addr_t       user_address;
    struct gfx_surface surface;             /* kernel view of the pixels */

    struct gui_event  events[WM_EVENT_QUEUE];
    uint32_t          event_head, event_tail;
};

int  wm_init(void);
int  wm_running(void);
void wm_start(void);                        /* spawns the compositor thread */

/* Called from the syscall layer. */
int  wm_create_window(struct process *owner, int width, int height,
                      const char *title, uint32_t flags);
int  wm_destroy_window(struct process *owner, uint32_t id);
int  wm_window_info(struct process *owner, uint32_t id, struct gui_window_info *out);
int  wm_invalidate(struct process *owner, uint32_t id, int x, int y, int w, int h);
int  wm_poll_event(struct process *owner, uint32_t id, struct gui_event *out);
int  wm_set_title(struct process *owner, uint32_t id, const char *title);
int  wm_move_window(struct process *owner, uint32_t id, int x, int y);
int  wm_resize_window(struct process *owner, uint32_t id, int width, int height);
int  wm_list_windows(struct gui_window_desc *out, int max);
int  wm_activate(uint32_t id);
int  wm_minimize(uint32_t id);
int  wm_set_flags(struct process *owner, uint32_t id, uint32_t flags);
void wm_close_process_windows(struct process *owner);

#endif
