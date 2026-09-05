/*
 * Window server.
 *
 * Applications own the pixels inside their windows: the server allocates a
 * buffer, maps it into the application's address space and never draws in it.
 * The server owns everything else - stacking order, decorations, the cursor,
 * input routing and getting finished frames onto the screen.
 *
 * Compositing is damage driven because pushing a full 1024x768 frame to the
 * card costs tens of milliseconds; repainting only what changed keeps
 * dragging a window and typing in a terminal comfortably interactive.
 */
#include <arch/x86.h>
#include <kernel/console.h>
#include <kernel/gfx.h>
#include <kernel/input.h>
#include <kernel/io.h>
#include <kernel/kprintf.h>
#include <kernel/mm.h>
#include <kernel/proc.h>
#include <kernel/sched.h>
#include <kernel/string.h>
#include <kernel/wm.h>

#define MAX_WINDOWS GUI_MAX_WINDOWS
#define MAX_DIRTY 24
#define WINDOW_VA_BASE 0x60000000u
#define WINDOW_VA_STEP 0x00400000u /* 4 MiB of address space per window */
#define CURSOR_W 12
#define CURSOR_H 19

/* Theme */
#define COLOR_DESKTOP_TOP RGB(0x08, 0x0D, 0x18)
#define COLOR_DESKTOP_BOTTOM RGB(0x11, 0x1A, 0x2D)
#define COLOR_TITLE_ACTIVE RGB(0x21, 0x3A, 0x66)
#define COLOR_TITLE_INACTIVE RGB(0x12, 0x1A, 0x28)
#define COLOR_TITLE_TEXT RGB(0xF4, 0xF7, 0xFB)
#define COLOR_BORDER RGB(0x25, 0x32, 0x48)
#define COLOR_SHADOW RGBA(0, 0, 0, 120)

static struct window windows[MAX_WINDOWS];
static uint32_t z_order[MAX_WINDOWS]; /* window ids, back to front */
static int z_count;
static uint32_t next_id = 1;
static int initialised;
static int focus_id;

static struct gfx_rect dirty[MAX_DIRTY];
static int dirty_count;
static int dirty_all;

/* Interaction state */
static int drag_id, drag_offset_x, drag_offset_y;
static int resize_id, resize_start_w, resize_start_h, resize_start_x,
    resize_start_y;
static int cursor_x, cursor_y, last_cursor_x, last_cursor_y;

static struct window *find(uint32_t id) {
  for (int i = 0; i < MAX_WINDOWS; i++) {
    if (windows[i].used && windows[i].id == id)
      return &windows[i];
  }
  return NULL;
}

/* ------------------------------------------------------------- geometry */

static int decorated(const struct window *w) {
  return !(w->flags & GUI_NODECOR);
}

static void frame_rect(const struct window *w, struct gfx_rect *out) {
  if (decorated(w)) {
    out->x = w->x - WM_BORDER;
    out->y = w->y - WM_TITLE_HEIGHT;
    out->w = w->width + WM_BORDER * 2;
    out->h = w->height + WM_TITLE_HEIGHT + WM_BORDER;
  } else {
    out->x = w->x;
    out->y = w->y;
    out->w = w->width;
    out->h = w->height;
  }
}

/* --------------------------------------------------------------- damage */

void wm_damage_rect(int x, int y, int w, int h) {
  if (w <= 0 || h <= 0 || dirty_all)
    return;

  if (dirty_count == MAX_DIRTY) {
    dirty_all = 1;
    return;
  }

  /* Merge into an existing rectangle when they overlap; the union of two
     nearby rectangles is nearly always cheaper than presenting both. */
  for (int i = 0; i < dirty_count; i++) {
    struct gfx_rect *r = &dirty[i];
    int ax1 = r->x + r->w, ay1 = r->y + r->h;
    int bx1 = x + w, by1 = y + h;

    if (x < ax1 + 16 && r->x < bx1 + 16 && y < ay1 + 16 && r->y < by1 + 16) {
      int nx = MIN(r->x, x), ny = MIN(r->y, y);

      r->w = MAX(ax1, bx1) - nx;
      r->h = MAX(ay1, by1) - ny;
      r->x = nx;
      r->y = ny;
      return;
    }
  }

  dirty[dirty_count].x = x;
  dirty[dirty_count].y = y;
  dirty[dirty_count].w = w;
  dirty[dirty_count].h = h;
  dirty_count++;
}

static void damage_window(const struct window *w) {
  struct gfx_rect r;

  frame_rect(w, &r);
  wm_damage_rect(r.x - 4, r.y - 4, r.w + 8, r.h + 8); /* include shadow */
}

/* ------------------------------------------------------------- z-order */

static void z_remove(uint32_t id) {
  int out = 0;

  for (int i = 0; i < z_count; i++) {
    if (z_order[i] != id)
      z_order[out++] = z_order[i];
  }
  z_count = out;
}

/* Insert respecting the bottom/top bands, so the wallpaper stays behind and
   the taskbar stays in front no matter what gets raised. */
static void z_insert(uint32_t id, uint32_t flags) {
  int position = z_count;

  if (flags & GUI_BOTTOM) {
    position = 0;
  } else if (!(flags & GUI_TOP)) {
    position = z_count;
    for (int i = 0; i < z_count; i++) {
      struct window *w = find(z_order[i]);

      if (w && (w->flags & GUI_TOP)) {
        position = i;
        break;
      }
    }
  }

  for (int i = z_count; i > position; i--)
    z_order[i] = z_order[i - 1];
  z_order[position] = id;
  z_count++;
}

static void raise_window(struct window *w) {
  z_remove(w->id);
  z_insert(w->id, w->flags);
  damage_window(w);
}

/* --------------------------------------------------------------- events */

static void queue_event(struct window *w, const struct gui_event *event) {
  uint32_t next = (w->event_head + 1) % WM_EVENT_QUEUE;

  if (next == w->event_tail)
    return; /* the application is not keeping up */
  w->events[w->event_head] = *event;
  w->events[w->event_head].window = w->id;
  w->event_head = next;
}

static void send_simple(struct window *w, uint32_t type) {
  struct gui_event event;

  memset(&event, 0, sizeof(event));
  event.type = type;
  event.width = (uint32_t)w->width;
  event.height = (uint32_t)w->height;
  queue_event(w, &event);
}

static void set_focus(uint32_t id) {
  struct window *previous;

  if (focus_id == (int)id)
    return;

  previous = find((uint32_t)focus_id);
  if (previous) {
    send_simple(previous, GUI_EVENT_BLUR);
    damage_window(previous);
  }

  focus_id = (int)id;

  {
    struct window *w = find(id);

    if (w) {
      send_simple(w, GUI_EVENT_FOCUS);
      damage_window(w);
    }
  }
}

/* ------------------------------------------------------------- buffers */

static int allocate_buffer(struct window *w, int width, int height) {
  uint32_t bytes = (uint32_t)width * height * 4;
  uint32_t pages = (bytes + PAGE_SIZE - 1) / PAGE_SIZE;
  phys_addr_t phys = pmm_alloc_frames(pages);

  if (!phys)
    return -1;

  memset((void *)phys, 0, pages * PAGE_SIZE);

  for (uint32_t i = 0; i < pages; i++) {
    if (vmm_map_in(&w->owner->space, w->user_address + i * PAGE_SIZE,
                   phys + i * PAGE_SIZE,
                   PTE_PRESENT | PTE_WRITE | PTE_USER) < 0) {
      pmm_free_contiguous(phys, pages);
      return -1;
    }
  }

  w->buffer_phys = phys;
  w->buffer_pages = pages;
  w->width = width;
  w->height = height;

  /* The kernel reaches the same pixels through the identity map. */
  gfx_surface_init(&w->surface, (uint32_t *)phys, width, height, width);
  return 0;
}

static void release_buffer(struct window *w) {
  if (!w->buffer_phys)
    return;

  for (uint32_t i = 0; i < w->buffer_pages; i++)
    vmm_unmap_in(&w->owner->space, w->user_address + i * PAGE_SIZE);
  pmm_free_contiguous(w->buffer_phys, w->buffer_pages);
  w->buffer_phys = 0;
  w->buffer_pages = 0;
}

/* ------------------------------------------------------------- painting */

static void draw_cursor(struct gfx_surface *screen, int x, int y) {
  /* A plain arrow, one bit per pixel: 1 = white fill, 2 = dark outline. */
  static const uint8_t shape[CURSOR_H][CURSOR_W] = {
      {2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0},
      {2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0},
      {2, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0},
      {2, 1, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0},
      {2, 1, 1, 1, 2, 0, 0, 0, 0, 0, 0, 0},
      {2, 1, 1, 1, 1, 2, 0, 0, 0, 0, 0, 0},
      {2, 1, 1, 1, 1, 1, 2, 0, 0, 0, 0, 0},
      {2, 1, 1, 1, 1, 1, 1, 2, 0, 0, 0, 0},
      {2, 1, 1, 1, 1, 1, 1, 1, 2, 0, 0, 0},
      {2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0, 0},
      {2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0},
      {2, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2},
      {2, 1, 1, 2, 1, 1, 2, 0, 0, 0, 0, 0},
      {2, 1, 2, 0, 2, 1, 1, 2, 0, 0, 0, 0},
      {2, 2, 0, 0, 2, 1, 1, 2, 0, 0, 0, 0},
      {2, 0, 0, 0, 0, 2, 1, 1, 2, 0, 0, 0},
      {0, 0, 0, 0, 0, 2, 1, 1, 2, 0, 0, 0},
      {0, 0, 0, 0, 0, 0, 2, 2, 2, 0, 0, 0},
      {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0},
  };

  for (int row = 0; row < CURSOR_H; row++) {
    for (int col = 0; col < CURSOR_W; col++) {
      uint8_t pixel = shape[row][col];

      if (pixel == 1)
        gfx_pixel(screen, x + col, y + row, RGB(0xFF, 0xFF, 0xFF));
      else if (pixel == 2)
        gfx_pixel(screen, x + col, y + row, RGB(0x10, 0x12, 0x18));
    }
  }
}

static void draw_decorations(struct gfx_surface *screen, struct window *w,
                             int active) {
  struct gfx_rect frame;
  uint32_t title_color = active ? COLOR_TITLE_ACTIVE : COLOR_TITLE_INACTIVE;
  uint32_t title_text = active ? COLOR_TITLE_TEXT : RGB(0x93, 0xA4, 0xBA);
  int cy;
  int min_cx;
  int close_cx;

  frame_rect(w, &frame);

  /* Layered shadow gives depth without asking the compositor for blur. */
  gfx_blend_rect(screen, frame.x + 5, frame.y + frame.h, frame.w, 6,
                 COLOR_SHADOW);
  gfx_blend_rect(screen, frame.x + frame.w, frame.y + 5, 6, frame.h,
                 COLOR_SHADOW);

  /* Rounded top chrome, squared into the client edge for a clean card shape. */
  gfx_round_rect(screen, frame.x, frame.y, frame.w, WM_TITLE_HEIGHT + 8, 8,
                 title_color);
  gfx_fill_rect(screen, frame.x, frame.y + WM_TITLE_HEIGHT - 8, frame.w, 8,
                title_color);
  if (active) {
    gfx_fill_rect(screen, frame.x, frame.y, frame.w, 2, RGB(0x4F, 0x7D, 0xF3));
  }
  gfx_frame_rect(screen, frame.x, frame.y, frame.w, frame.h, COLOR_BORDER);

  gfx_text_clipped(screen, frame.x + 14, frame.y + 10, w->title, title_text, 1,
                   frame.w - 92);

  cy = frame.y + WM_TITLE_HEIGHT / 2;
  min_cx = frame.x + frame.w - 46;
  close_cx = frame.x + frame.w - 20;

  /* Compact traffic-light controls. */
  gfx_circle(screen, min_cx, cy, 7,
             active ? RGB(0xF2, 0xB8, 0x4B) : RGB(0x64, 0x6F, 0x82));
  gfx_hline(screen, min_cx - 3, cy + 2, 7, RGB(0x24, 0x2B, 0x36));

  gfx_circle(screen, close_cx, cy, 7,
             active ? RGB(0xF0, 0x6C, 0x75) : RGB(0x64, 0x6F, 0x82));
  gfx_line(screen, close_cx - 3, cy - 3, close_cx + 3, cy + 3,
           RGB(0x24, 0x2B, 0x36));
  gfx_line(screen, close_cx + 3, cy - 3, close_cx - 3, cy + 3,
           RGB(0x24, 0x2B, 0x36));
}

/* Repaint one screen rectangle from scratch and push it to the card. */
static void compose_rect(int rx, int ry, int rw, int rh) {
  struct gfx_surface *screen = gfx_screen();

  if (rx < 0) {
    rw += rx;
    rx = 0;
  }
  if (ry < 0) {
    rh += ry;
    ry = 0;
  }
  if (rx + rw > gfx_width())
    rw = gfx_width() - rx;
  if (ry + rh > gfx_height())
    rh = gfx_height() - ry;
  if (rw <= 0 || rh <= 0)
    return;

  gfx_clip_set(screen, rx, ry, rw, rh);

  /* Desktop background, in case nothing covers this area. */
  gfx_gradient_v(screen, rx, ry, rw, rh, COLOR_DESKTOP_TOP,
                 COLOR_DESKTOP_BOTTOM);

  for (int i = 0; i < z_count; i++) {
    struct window *w = find(z_order[i]);
    struct gfx_rect frame;

    if (!w || w->state == GUI_STATE_MINIMIZED)
      continue;

    frame_rect(w, &frame);
    if (frame.x >= rx + rw || frame.y >= ry + rh || frame.x + frame.w <= rx ||
        frame.y + frame.h <= ry)
      continue;

    if (decorated(w))
      draw_decorations(screen, w, w->id == (uint32_t)focus_id);

    gfx_blit(screen, w->x, w->y, &w->surface, 0, 0, w->width, w->height);
  }

  draw_cursor(screen, cursor_x, cursor_y);

  gfx_clip_reset(screen);
  gfx_present_rect(rx, ry, rw, rh);
}

static void compose(void) {
  if (dirty_all) {
    compose_rect(0, 0, gfx_width(), gfx_height());
  } else {
    for (int i = 0; i < dirty_count; i++)
      compose_rect(dirty[i].x, dirty[i].y, dirty[i].w, dirty[i].h);
  }
  dirty_count = 0;
  dirty_all = 0;
}

/* --------------------------------------------------------------- input */

/* Which window is under this point, topmost first? */
static struct window *window_at(int x, int y, int *hit_title) {
  for (int i = z_count - 1; i >= 0; i--) {
    struct window *w = find(z_order[i]);
    struct gfx_rect frame;

    if (!w || w->state == GUI_STATE_MINIMIZED)
      continue;
    frame_rect(w, &frame);
    if (x < frame.x || y < frame.y || x >= frame.x + frame.w ||
        y >= frame.y + frame.h)
      continue;

    if (hit_title)
      *hit_title = decorated(w) && y < w->y;
    return w;
  }
  return NULL;
}

static void deliver_mouse(struct window *w, uint32_t type, int x, int y,
                          uint32_t buttons, int button, int wheel) {
  struct gui_event event;

  memset(&event, 0, sizeof(event));
  event.type = type;
  event.x = x - w->x;
  event.y = y - w->y;
  event.buttons = buttons;
  event.button = button;
  event.wheel = wheel;
  queue_event(w, &event);
}

static void handle_mouse_down(int x, int y, int button) {
  int hit_title = 0;
  struct window *w = window_at(x, y, &hit_title);

  if (!w) {
    set_focus(0);
    return;
  }

  if (!(w->flags & GUI_BOTTOM)) {
    set_focus(w->id);
    raise_window(w);
  }

  if (hit_title && button == MOUSE_LEFT) {
    struct gfx_rect frame;

    frame_rect(w, &frame);

    if (x >= frame.x + frame.w - 28 && x < frame.x + frame.w - 10) {
      send_simple(w, GUI_EVENT_CLOSE);
      return;
    }
    if (x >= frame.x + frame.w - 54 && x < frame.x + frame.w - 36) {
      wm_minimize(w->id);
      return;
    }

    drag_id = (int)w->id;
    drag_offset_x = x - w->x;
    drag_offset_y = y - w->y;
    return;
  }

  /* Bottom right corner starts a resize. */
  if (!(w->flags & (GUI_FIXED | GUI_NODECOR)) && x >= w->x + w->width - 12 &&
      y >= w->y + w->height - 12) {
    resize_id = (int)w->id;
    resize_start_x = x;
    resize_start_y = y;
    resize_start_w = w->width;
    resize_start_h = w->height;
    return;
  }

  deliver_mouse(w, GUI_EVENT_MOUSE_DOWN, x, y, (uint32_t)button, button, 0);
}

static void handle_mouse_up(int x, int y, int button) {
  struct window *w;

  if (drag_id) {
    drag_id = 0;
    return;
  }
  if (resize_id) {
    struct window *resizing = find((uint32_t)resize_id);

    resize_id = 0;
    if (resizing)
      send_simple(resizing, GUI_EVENT_RESIZE);
    return;
  }

  w = window_at(x, y, NULL);
  if (w)
    deliver_mouse(w, GUI_EVENT_MOUSE_UP, x, y, 0, button, 0);
}

static void handle_mouse_move(int x, int y, uint32_t buttons) {
  if (drag_id) {
    struct window *w = find((uint32_t)drag_id);

    if (w) {
      damage_window(w);
      w->x = x - drag_offset_x;
      w->y = y - drag_offset_y;
      if (w->y < WM_TITLE_HEIGHT)
        w->y = WM_TITLE_HEIGHT;
      damage_window(w);
    }
    return;
  }

  if (resize_id) {
    struct window *w = find((uint32_t)resize_id);

    if (w) {
      int width = resize_start_w + (x - resize_start_x);
      int height = resize_start_h + (y - resize_start_y);

      if (width < 160)
        width = 160;
      if (height < 100)
        height = 100;
      if (width != w->width || height != w->height)
        wm_resize_window(w->owner, w->id, width, height);
    }
    return;
  }

  {
    struct window *w = window_at(x, y, NULL);

    if (w)
      deliver_mouse(w, GUI_EVENT_MOUSE_MOVE, x, y, buttons, 0, 0);
  }
}

static void handle_input(void) {
  struct input_event event;

  while (input_poll(&event)) {
    switch (event.kind) {
    case INPUT_MOUSE_MOVE:
      cursor_x = event.x;
      cursor_y = event.y;
      handle_mouse_move(event.x, event.y, event.buttons);
      break;
    case INPUT_MOUSE_DOWN:
      cursor_x = event.x;
      cursor_y = event.y;
      handle_mouse_down(event.x, event.y, event.button);
      break;
    case INPUT_MOUSE_UP:
      cursor_x = event.x;
      cursor_y = event.y;
      handle_mouse_up(event.x, event.y, event.button);
      break;
    case INPUT_MOUSE_WHEEL: {
      struct window *w = window_at(event.x, event.y, NULL);

      if (w)
        deliver_mouse(w, GUI_EVENT_WHEEL, event.x, event.y, 0, 0, event.wheel);
      break;
    }
    case INPUT_KEY: {
      struct window *w = find((uint32_t)focus_id);
      struct gui_event out;

      if (!w)
        break;
      memset(&out, 0, sizeof(out));
      out.type = GUI_EVENT_KEY;
      out.key = event.key;
      queue_event(w, &out);
      break;
    }
    default:
      break;
    }
  }
}

/* --------------------------------------------------------- public API */

int wm_create_window(struct process *owner, int width, int height,
                     const char *title, uint32_t flags) {
  struct window *w = NULL;
  int slot = -1;

  if (!initialised || width <= 0 || height <= 0)
    return -1;
  if (width > gfx_width() || height > gfx_height())
    return -1;

  for (int i = 0; i < MAX_WINDOWS; i++) {
    if (!windows[i].used) {
      slot = i;
      break;
    }
  }
  if (slot < 0)
    return -2;

  w = &windows[slot];
  memset(w, 0, sizeof(*w));
  w->used = 1;
  w->id = next_id++;
  w->owner = owner;
  w->flags = flags;
  w->state = GUI_STATE_NORMAL;
  w->user_address = WINDOW_VA_BASE + (uint32_t)slot * WINDOW_VA_STEP;
  strlcpy(w->title, title ? title : "Window", GUI_MAX_TITLE);

  /* Cascade new windows so they do not all land on top of each other. */
  if (flags & GUI_BOTTOM) {
    w->x = 0;
    w->y = 0;
  } else if (flags & GUI_TOP) {
    w->x = 0;
    w->y = gfx_height() - height;
  } else {
    static int cascade;

    w->x = 60 + (cascade % 6) * 28;
    w->y = 60 + (cascade % 6) * 24;
    cascade++;
    if (w->x + width > gfx_width())
      w->x = 20;
    if (w->y + height > gfx_height() - 40)
      w->y = WM_TITLE_HEIGHT + 8;
  }

  if (allocate_buffer(w, width, height) < 0) {
    w->used = 0;
    return -3;
  }

  z_insert(w->id, flags);
  if (!(flags & (GUI_BOTTOM | GUI_TOP)))
    set_focus(w->id);
  damage_window(w);

  return (int)w->id;
}

int wm_destroy_window(struct process *owner, uint32_t id) {
  struct window *w = find(id);

  if (!w || (owner && w->owner != owner))
    return -1;

  damage_window(w);
  release_buffer(w);
  z_remove(id);
  w->used = 0;

  if (focus_id == (int)id) {
    focus_id = 0;
    for (int i = z_count - 1; i >= 0; i--) {
      struct window *candidate = find(z_order[i]);

      if (candidate && !(candidate->flags & (GUI_BOTTOM | GUI_TOP))) {
        set_focus(candidate->id);
        break;
      }
    }
  }
  return 0;
}

void wm_close_process_windows(struct process *owner) {
  for (int i = 0; i < MAX_WINDOWS; i++) {
    if (windows[i].used && windows[i].owner == owner)
      wm_destroy_window(owner, windows[i].id);
  }
}

int wm_window_info(struct process *owner, uint32_t id,
                   struct gui_window_info *out) {
  struct window *w = find(id);

  if (!w || w->owner != owner)
    return -1;

  out->id = w->id;
  out->width = (uint32_t)w->width;
  out->height = (uint32_t)w->height;
  out->stride = (uint32_t)w->width;
  out->buffer = w->user_address;
  out->flags = w->flags;
  out->x = w->x;
  out->y = w->y;
  return 0;
}

int wm_invalidate(struct process *owner, uint32_t id, int x, int y, int w_,
                  int h) {
  struct window *w = find(id);

  if (!w || w->owner != owner)
    return -1;
  if (w->state == GUI_STATE_MINIMIZED)
    return 0;

  if (w_ <= 0 || h <= 0) {
    x = 0;
    y = 0;
    w_ = w->width;
    h = w->height;
  }
  wm_damage_rect(w->x + x, w->y + y, w_, h);
  return 0;
}

int wm_poll_event(struct process *owner, uint32_t id, struct gui_event *out) {
  struct window *w = find(id);
  uint32_t flags;

  if (!w || w->owner != owner)
    return -1;

  flags = irq_save();
  if (w->event_tail == w->event_head) {
    irq_restore(flags);
    return 0;
  }
  *out = w->events[w->event_tail];
  w->event_tail = (w->event_tail + 1) % WM_EVENT_QUEUE;
  irq_restore(flags);
  return 1;
}

int wm_set_title(struct process *owner, uint32_t id, const char *title) {
  struct window *w = find(id);

  if (!w || w->owner != owner)
    return -1;
  strlcpy(w->title, title, GUI_MAX_TITLE);
  damage_window(w);
  return 0;
}

int wm_move_window(struct process *owner, uint32_t id, int x, int y) {
  struct window *w = find(id);

  if (!w || w->owner != owner)
    return -1;
  damage_window(w);
  w->x = x;
  w->y = y;
  damage_window(w);
  return 0;
}

int wm_resize_window(struct process *owner, uint32_t id, int width,
                     int height) {
  struct window *w = find(id);
  phys_addr_t old_phys;
  uint32_t old_pages;
  int old_w, old_h;

  if (!w || w->owner != owner)
    return -1;
  if (width <= 0 || height <= 0 || width > gfx_width() || height > gfx_height())
    return -1;
  if (width == w->width && height == w->height)
    return 0;

  damage_window(w);

  old_phys = w->buffer_phys;
  old_pages = w->buffer_pages;
  old_w = w->width;
  old_h = w->height;

  /* Unmap first: the new buffer reuses the same user address. */
  for (uint32_t i = 0; i < old_pages; i++)
    vmm_unmap_in(&w->owner->space, w->user_address + i * PAGE_SIZE);
  w->buffer_phys = 0;

  if (allocate_buffer(w, width, height) < 0) {
    /* Put the old buffer back so the application keeps working. */
    for (uint32_t i = 0; i < old_pages; i++)
      vmm_map_in(&w->owner->space, w->user_address + i * PAGE_SIZE,
                 old_phys + i * PAGE_SIZE, PTE_PRESENT | PTE_WRITE | PTE_USER);
    w->buffer_phys = old_phys;
    w->buffer_pages = old_pages;
    w->width = old_w;
    w->height = old_h;
    gfx_surface_init(&w->surface, (uint32_t *)old_phys, old_w, old_h, old_w);
    return -1;
  }

  pmm_free_contiguous(old_phys, old_pages);
  send_simple(w, GUI_EVENT_RESIZE);
  damage_window(w);
  return 0;
}

int wm_list_windows(struct gui_window_desc *out, int max) {
  int count = 0;

  for (int i = 0; i < z_count && count < max; i++) {
    struct window *w = find(z_order[i]);

    if (!w || (w->flags & GUI_NOTASKBAR))
      continue;

    out[count].id = w->id;
    out[count].pid = w->owner ? (uint32_t)w->owner->pid : 0;
    out[count].flags = w->flags;
    out[count].state = w->state;
    out[count].focused = (w->id == (uint32_t)focus_id);
    strlcpy(out[count].title, w->title, GUI_MAX_TITLE);
    count++;
  }
  return count;
}

int wm_activate(uint32_t id) {
  struct window *w = find(id);

  if (!w)
    return -1;
  if (w->state == GUI_STATE_MINIMIZED)
    w->state = GUI_STATE_NORMAL;
  raise_window(w);
  set_focus(id);
  return 0;
}

int wm_minimize(uint32_t id) {
  struct window *w = find(id);

  if (!w)
    return -1;
  damage_window(w);
  w->state = (w->state == GUI_STATE_MINIMIZED) ? GUI_STATE_NORMAL
                                               : GUI_STATE_MINIMIZED;
  if (w->state == GUI_STATE_MINIMIZED && focus_id == (int)id)
    focus_id = 0;
  dirty_all = 1;
  return 0;
}

int wm_set_flags(struct process *owner, uint32_t id, uint32_t flags) {
  struct window *w = find(id);

  if (!w || w->owner != owner)
    return -1;
  w->flags = flags;
  z_remove(id);
  z_insert(id, flags);
  dirty_all = 1;
  return 0;
}

/* ---------------------------------------------------------- compositor */

static void compositor_thread(void *arg) {
  (void)arg;

  for (;;) {
    handle_input();

    if (cursor_x != last_cursor_x || cursor_y != last_cursor_y) {
      wm_damage_rect(last_cursor_x, last_cursor_y, CURSOR_W + 1, CURSOR_H + 1);
      wm_damage_rect(cursor_x, cursor_y, CURSOR_W + 1, CURSOR_H + 1);
      last_cursor_x = cursor_x;
      last_cursor_y = cursor_y;
    }

    if (dirty_count || dirty_all)
      compose();

    thread_sleep_ms(16); /* aim for 60 frames a second */
  }
}

int wm_running(void) { return initialised; }

int wm_init(void) {
  if (!gfx_available())
    return -1;

  memset(windows, 0, sizeof(windows));
  z_count = 0;
  cursor_x = last_cursor_x = gfx_width() / 2;
  cursor_y = last_cursor_y = gfx_height() / 2;
  initialised = 1;
  dirty_all = 1;
  return 0;
}

void wm_start(void) {
  if (!initialised)
    return;
  console_set_screen_output(0); /* the desktop owns the screen now */
  thread_create("compositor", compositor_thread, NULL);
}
