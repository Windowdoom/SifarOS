/*
 * The desktop shell.
 *
 * An ordinary user process: it owns a full screen window at the bottom of the
 * stack for the wallpaper and icons, a taskbar window pinned on top, and a
 * launcher menu it shows and hides.  Everything it does - listing windows,
 * raising them, starting programs - goes through the same system calls any
 * other application could use.
 */
#include "ui.h"

#define TASKBAR_HEIGHT 48
#define ICON_SIZE 44
#define ICON_CELL_W 104
#define ICON_CELL_H 88
#define MAX_APPS 24
#define MENU_WIDTH 280

struct app_entry {
  char name[SYS_NAME_MAX];
  char label[32];
  char path[64];
  int icon;
};

static struct app_entry apps[MAX_APPS];
static int app_count;

static int screen_w, screen_h;

/* Preferences, shared with the settings application through a small file. */
#define CONFIG_PATH "/etc/desktop.conf"

static const uint32_t theme_colors[][2] = {
    {0xFF070C16, 0xFF17233D}, {0xFF0B0F16, 0xFF252E3C},
    {0xFF07150F, 0xFF123827}, {0xFF130A1A, 0xFF39224D},
    {0xFF190D08, 0xFF4A2418},
};

static int theme;
static int show_grid = 1;

/* Returns 1 when the settings changed since the last check. */
static int reload_config(void) {
  char buffer[128];
  int n = file_read(CONFIG_PATH, buffer, sizeof(buffer) - 1);
  int new_theme = 0, new_grid = 1;
  int changed;

  if (n > 0) {
    buffer[n] = '\0';
    for (char *p = buffer; *p; p++) {
      if (strncmp(p, "theme=", 6) == 0)
        new_theme = atoi(p + 6);
      else if (strncmp(p, "grid=", 5) == 0)
        new_grid = atoi(p + 5);
    }
  }
  if (new_theme < 0 ||
      new_theme >= (int)(sizeof(theme_colors) / sizeof(theme_colors[0])))
    new_theme = 0;

  changed = (new_theme != theme) || (new_grid != show_grid);
  theme = new_theme;
  show_grid = new_grid;
  return changed;
}

/* Applications we know about get a friendlier name and a matching icon. */
struct known {
  const char *name;
  const char *label;
  int icon;
};

enum {
  ICON_GENERIC = 0,
  ICON_TERMINAL,
  ICON_FILES,
  ICON_EDITOR,
  ICON_PAINT,
  ICON_CALC,
  ICON_MONITOR,
  ICON_SETTINGS,
  ICON_CLOCK,
  ICON_GAME,
  ICON_BROWSER,
  ICON_TEXT
};

static const struct known known_apps[] = {
    {"terminal", "Terminal", ICON_TERMINAL},
    {"browser", "Sifar Web", ICON_BROWSER},
    {"files", "Files", ICON_FILES},
    {"editor", "Text Editor", ICON_EDITOR},
    {"paint", "Paint", ICON_PAINT},
    {"calc", "Calculator", ICON_CALC},
    {"monitor", "System Monitor", ICON_MONITOR},
    {"settings", "Settings", ICON_SETTINGS},
    {"clock", "Clock", ICON_CLOCK},
    {"snake", "Snake", ICON_GAME},
    {"about", "About SifarOS", ICON_TEXT},
};

static void load_apps(void) {
  struct sys_dirent entries[MAX_APPS];
  int count = list_directory("/apps", entries, MAX_APPS);

  app_count = 0;
  for (int i = 0; i < count && app_count < MAX_APPS; i++) {
    struct app_entry *app;

    if (entries[i].type != 1)
      continue;
    /* The desktop does not list itself. */
    if (strcmp(entries[i].name, "desktop") == 0)
      continue;

    app = &apps[app_count++];
    strlcpy(app->name, entries[i].name, sizeof(app->name));
    strlcpy(app->label, entries[i].name, sizeof(app->label));
    snprintf(app->path, sizeof(app->path), "/apps/%s", entries[i].name);
    app->icon = ICON_GENERIC;

    for (unsigned k = 0; k < sizeof(known_apps) / sizeof(known_apps[0]); k++) {
      if (strcmp(known_apps[k].name, entries[i].name) == 0) {
        strlcpy(app->label, known_apps[k].label, sizeof(app->label));
        app->icon = known_apps[k].icon;
        break;
      }
    }
  }
}

/* ------------------------------------------------------------------ icons */

static void draw_icon(ui_window *w, int x, int y, int size, int kind) {
  uint32_t body = UI_RGB(0x3A, 0x4A, 0x66);
  int unit = size / 8;

  switch (kind) {
  case ICON_TERMINAL:
    ui_round_fill(w, x, y, size, size, 6, UI_RGB(0x18, 0x20, 0x2C));
    ui_frame(w, x, y, size, size, UI_RGB(0x50, 0x60, 0x78));
    ui_text(w, x + unit * 2, y + unit * 2, ">", UI_RGB(0x60, 0xE0, 0x90));
    ui_fill(w, x + unit * 3 + 4, y + unit * 3, unit * 3, 2,
            UI_RGB(0x60, 0xE0, 0x90));
    break;
  case ICON_FILES:
    ui_round_fill(w, x, y + unit, size, size - unit * 2, 4,
                  UI_RGB(0xD8, 0xA8, 0x40));
    ui_fill(w, x, y + unit, size / 2, unit, UI_RGB(0xE8, 0xC0, 0x60));
    ui_round_fill(w, x + 3, y + unit * 2, size - 6, size - unit * 3, 3,
                  UI_RGB(0xF0, 0xD0, 0x80));
    break;
  case ICON_EDITOR:
    ui_round_fill(w, x + unit, y, size - unit * 2, size, 3,
                  UI_RGB(0xF0, 0xF2, 0xF6));
    for (int i = 0; i < 4; i++)
      ui_fill(w, x + unit * 2, y + unit * 2 + i * unit, size - unit * 4, 2,
              UI_RGB(0x60, 0x70, 0x88));
    break;
  case ICON_PAINT:
    ui_circle(w, x + size / 2, y + size / 2, size / 2 - 2,
              UI_RGB(0xE8, 0xE0, 0xD0));
    ui_circle(w, x + size / 3, y + size / 3, unit, UI_RGB(0xD0, 0x50, 0x50));
    ui_circle(w, x + size * 2 / 3, y + size / 3, unit,
              UI_RGB(0x50, 0x90, 0xD0));
    ui_circle(w, x + size / 2, y + size * 2 / 3, unit,
              UI_RGB(0x60, 0xB0, 0x60));
    break;
  case ICON_CALC:
    ui_round_fill(w, x, y, size, size, 5, UI_RGB(0x2E, 0x38, 0x4A));
    ui_fill(w, x + unit, y + unit, size - unit * 2, unit * 2,
            UI_RGB(0x90, 0xC8, 0xA0));
    for (int row = 0; row < 3; row++) {
      for (int col = 0; col < 3; col++)
        ui_fill(w, x + unit + col * unit * 2, y + unit * 4 + row * unit * 1.5,
                unit, unit, UI_RGB(0x70, 0x80, 0x98));
    }
    break;
  case ICON_MONITOR:
    ui_round_fill(w, x, y, size, size, 5, UI_RGB(0x20, 0x2A, 0x3A));
    for (int i = 0; i < 4; i++) {
      int bar = unit * (2 + (i % 3) * 2);

      ui_fill(w, x + unit + i * unit * 2, y + size - unit - bar, unit + 2, bar,
              UI_RGB(0x50, 0xC0, 0x90));
    }
    break;
  case ICON_SETTINGS:
    ui_circle(w, x + size / 2, y + size / 2, size / 2 - 2,
              UI_RGB(0x78, 0x88, 0xA0));
    ui_circle(w, x + size / 2, y + size / 2, size / 5,
              UI_RGB(0x20, 0x28, 0x38));
    for (int i = 0; i < 4; i++) {
      int dx = (i == 0) ? -1 : (i == 1) ? 1 : 0;
      int dy = (i == 2) ? -1 : (i == 3) ? 1 : 0;

      ui_fill(w, x + size / 2 - 3 + dx * (size / 2 - 3),
              y + size / 2 - 3 + dy * (size / 2 - 3), 6, 6,
              UI_RGB(0x78, 0x88, 0xA0));
    }
    break;
  case ICON_CLOCK:
    ui_circle(w, x + size / 2, y + size / 2, size / 2 - 1,
              UI_RGB(0xE8, 0xEC, 0xF4));
    ui_circle(w, x + size / 2, y + size / 2, size / 2 - 4,
              UI_RGB(0x28, 0x32, 0x44));
    ui_line(w, x + size / 2, y + size / 2, x + size / 2, y + size / 4,
            UI_WHITE);
    ui_line(w, x + size / 2, y + size / 2, x + size * 2 / 3, y + size / 2,
            UI_WHITE);
    break;
  case ICON_GAME:
    ui_round_fill(w, x, y + unit, size, size - unit * 2, 6,
                  UI_RGB(0x38, 0x70, 0x48));
    for (int i = 0; i < 3; i++)
      ui_round_fill(w, x + unit + i * unit * 2, y + size / 2 - unit,
                    unit * 2 - 2, unit * 2 - 2, 2, UI_RGB(0x90, 0xE0, 0xA0));
    break;
  case ICON_BROWSER:
    ui_circle(w, x + size / 2, y + size / 2, size / 2 - 1, UI_ACCENT);
    ui_circle(w, x + size / 2, y + size / 2, size / 2 - 5,
              UI_RGB(0x0E, 0x16, 0x26));
    ui_line(w, x + 5, y + size / 2, x + size - 6, y + size / 2,
            UI_ACCENT_LIGHT);
    ui_line(w, x + size / 2, y + 5, x + size / 2, y + size - 6,
            UI_ACCENT_LIGHT);
    ui_circle(w, x + size / 2, y + size / 2, size / 4,
              UI_RGB(0x4F, 0x7D, 0xF3));
    ui_circle(w, x + size / 2, y + size / 2, size / 4 - 2,
              UI_RGB(0x0E, 0x16, 0x26));
    break;
  case ICON_TEXT:
    ui_round_fill(w, x + unit, y, size - unit * 2, size, 3,
                  UI_RGB(0xDCE, 0xE4, 0xF0));
    ui_round_fill(w, x + unit, y, size - unit * 2, size, 3,
                  UI_RGB(0xDC, 0xE4, 0xF0));
    ui_text(w, x + size / 2 - 4, y + size / 2 - 8, "i",
            UI_RGB(0x30, 0x60, 0xA0));
    break;
  default:
    ui_round_fill(w, x, y, size, size, 6, body);
    ui_frame(w, x, y, size, size, UI_BORDER);
    break;
  }
}

/* --------------------------------------------------------------- wallpaper */

static int selected_icon = -1;

static void draw_wallpaper(ui_window *w) {
  ui_gradient(w, 0, 0, w->width, w->height, theme_colors[theme][0],
              theme_colors[theme][1]);

  /* Broad light fields create depth without expensive blur. */
  ui_blend(w, w->width / 2, 0, w->width / 2, w->height / 2,
           UI_RGBA(0x4F, 0x7D, 0xF3, 10));
  ui_blend(w, w->width * 2 / 3, w->height / 3, w->width / 3, w->height / 2,
           UI_RGBA(0x78, 0xA1, 0xFF, 7));

  if (show_grid) {
    for (int x = 0; x < w->width; x += 64)
      ui_blend(w, x, 0, 1, w->height, UI_RGBA(0xFF, 0xFF, 0xFF, 4));
    for (int y = 0; y < w->height; y += 64)
      ui_blend(w, 0, y, w->width, 1, UI_RGBA(0xFF, 0xFF, 0xFF, 4));
  }

  ui_text_scaled(w, w->width - 232, w->height - 122, "SIFAR",
                 UI_RGBA(0xFF, 0xFF, 0xFF, 46), 3);
  ui_text(w, w->width - 232, w->height - 72, "OS 2.0  /  adaptive by design",
          UI_RGBA(0xFF, 0xFF, 0xFF, 48));

  for (int i = 0; i < app_count; i++) {
    int column = i / 6;
    int row = i % 6;
    int x = 24 + column * ICON_CELL_W;
    int y = 24 + row * ICON_CELL_H;
    int hover = ui_hit(w, x - 8, y - 6, ICON_CELL_W - 16, ICON_CELL_H - 10);

    if (i == selected_icon || hover)
      ui_round_fill(w, x - 8, y - 6, ICON_CELL_W - 16, ICON_CELL_H - 10, 10,
                    i == selected_icon ? UI_RGBA(0x4F, 0x7D, 0xF3, 72)
                                       : UI_RGBA(0xFF, 0xFF, 0xFF, 20));

    draw_icon(w, x + (ICON_CELL_W - 32 - ICON_SIZE) / 2, y, ICON_SIZE,
              apps[i].icon);
    ui_text_center(w, x - 8, y + ICON_SIZE + 8, ICON_CELL_W - 16, apps[i].label,
                   i == selected_icon ? UI_WHITE : UI_TEXT);
  }
}

/* ----------------------------------------------------------------- taskbar */

static int launcher_open;

static void draw_taskbar(ui_window *w, struct gui_window_desc *windows,
                         int count) {
  struct sys_time now;
  char clock[24];
  struct sys_info info;
  char memory[40];
  int x = 10;

  ui_gradient(w, 0, 0, w->width, w->height, UI_RGB(0x0D, 0x14, 0x22),
              UI_RGB(0x08, 0x0D, 0x18));
  ui_fill(w, 0, 0, w->width, 1, UI_BORDER);

  {
    int width = 98;
    int hover = ui_hit(w, x, 7, width, TASKBAR_HEIGHT - 14);
    uint32_t face =
        launcher_open ? UI_ACCENT : (hover ? UI_PANEL_LIGHT : UI_SURFACE_ALT);

    ui_round_fill(w, x, 7, width, TASKBAR_HEIGHT - 14, 10, face);
    ui_circle(w, x + 18, 24, 8, launcher_open ? UI_WHITE : UI_ACCENT);
    ui_text(w, x + 14, 16, "S", launcher_open ? UI_ACCENT : UI_WHITE);
    ui_text(w, x + 34, 16, "Sifar", UI_WHITE);

    if (hover && w->mouse_pressed) {
      launcher_open = !launcher_open;
      w->dirty = 1;
    }
    x += width + 10;
  }

  for (int i = 0; i < count; i++) {
    int width = 138;
    int hover = ui_hit(w, x, 7, width, TASKBAR_HEIGHT - 14);
    uint32_t face =
        windows[i].focused
            ? UI_ACCENT
            : (windows[i].state == GUI_STATE_MINIMIZED ? UI_BG
                                                       : UI_SURFACE_ALT);

    if (x + width > w->width - 230)
      break;

    ui_round_fill(w, x, 7, width, TASKBAR_HEIGHT - 14, 10,
                  hover && !windows[i].focused ? UI_PANEL_LIGHT : face);
    ui_clip_set(w, x + 10, 7, width - 20, TASKBAR_HEIGHT - 14);
    ui_text(w, x + 12, 16, windows[i].title,
            windows[i].focused ? UI_WHITE : UI_TEXT);
    ui_clip_reset(w);

    if (hover && w->mouse_pressed) {
      if (windows[i].focused)
        syscall3(SYS_GUI_MINIMIZE, (int)windows[i].id, 0, 0);
      else
        syscall3(SYS_GUI_ACTIVATE, (int)windows[i].id, 0, 0);
      w->dirty = 1;
    }
    x += width + 7;
  }

  if (system_info(&info) == 0) {
    snprintf(memory, sizeof(memory), "%d MiB free",
             (int)((info.total_memory_kb - info.used_memory_kb) / 1024));
    ui_round_fill(w, w->width - 224, 8, 116, TASKBAR_HEIGHT - 16, 9,
                  UI_SURFACE_ALT);
    ui_text_center(w, w->width - 224, 16, 116, memory, UI_TEXT_DIM);
  }
  if (system_time(&now) == 0) {
    snprintf(clock, sizeof(clock), "%02d:%02d", (int)now.hour, (int)now.minute);
    ui_text(w, w->width - 88, 16, clock, UI_WHITE);
  }
}

/* ---------------------------------------------------------------- launcher */

static void draw_launcher(ui_window *w, int *launch_index) {
  ui_round_fill(w, 0, 0, w->width, w->height, 12, UI_PANEL);
  ui_frame(w, 0, 0, w->width, w->height, UI_BORDER);

  ui_circle(w, 24, 24, 10, UI_ACCENT);
  ui_text(w, 20, 16, "S", UI_WHITE);
  ui_text(w, 44, 10, "Sifar", UI_WHITE);
  ui_text(w, 44, 27, "Applications", UI_TEXT_DIM);
  ui_fill(w, 14, 48, w->width - 28, 1, UI_BORDER);

  for (int i = 0; i < app_count; i++) {
    int y = 56 + i * 34;
    int hover = ui_hit(w, 10, y, w->width - 20, 30);

    if (y + 30 > w->height)
      break;
    if (hover)
      ui_round_fill(w, 10, y, w->width - 20, 30, 8, UI_SURFACE_ALT);
    draw_icon(w, 16, y + 3, 24, apps[i].icon);
    ui_text(w, 50, y + 7, apps[i].label, UI_TEXT);

    if (hover && w->mouse_pressed)
      *launch_index = i;
  }
}

/* -------------------------------------------------------------------- main */

int main(int argc, char **argv) {
  ui_window *wallpaper;
  ui_window *taskbar;
  ui_window *launcher;
  struct gui_window_desc windows[GUI_MAX_WINDOWS];
  int window_count = 0;
  int last_clock_update = 0;
  int running_pids[16];
  int running_count = 0;

  ui_init();
  if (ui_screen_size(&screen_w, &screen_h) < 0)
    return 1;

  load_apps();
  reload_config();

  wallpaper = ui_window_open("desktop", screen_w, screen_h - TASKBAR_HEIGHT,
                             GUI_BOTTOM | GUI_NODECOR | GUI_NOTASKBAR);
  taskbar = ui_window_open("taskbar", screen_w, TASKBAR_HEIGHT,
                           GUI_TOP | GUI_NODECOR | GUI_NOTASKBAR);
  launcher = NULL;

  if (!wallpaper || !taskbar)
    return 1;

  ui_move(wallpaper, 0, 0);
  ui_move(taskbar, 0, screen_h - TASKBAR_HEIGHT);

  for (;;) {
    int launch_index = -1;

    /* ---- wallpaper: icons and double click to launch ---- */
    if (ui_begin(wallpaper)) {
      if (wallpaper->mouse_pressed) {
        int hit = -1;

        for (int i = 0; i < app_count; i++) {
          int column = i / 6, row = i % 6;
          int x = 24 + column * ICON_CELL_W;
          int y = 24 + row * ICON_CELL_H;

          if (ui_hit(wallpaper, x - 8, y - 6, ICON_CELL_W - 16,
                     ICON_CELL_H - 16))
            hit = i;
        }
        if (hit >= 0) {
          static int last_hit = -1;
          static int last_time;
          int now = uptime_ms();

          if (hit == last_hit && now - last_time < 600)
            launch_index = hit;
          last_hit = hit;
          last_time = now;
        }
        selected_icon = hit;
        wallpaper->dirty = 1;
      }
      if (wallpaper->dirty)
        draw_wallpaper(wallpaper);
      ui_end(wallpaper);
    }

    /* ---- taskbar ---- */
    if (ui_begin(taskbar)) {
      int now = uptime_ms();

      window_count = syscall3(SYS_GUI_LIST, (int)windows, GUI_MAX_WINDOWS, 0);
      if (window_count < 0)
        window_count = 0;

      if (now - last_clock_update > 500) {
        last_clock_update = now;
        taskbar->dirty = 1;
      }
      if (taskbar->dirty)
        draw_taskbar(taskbar, windows, window_count);
      ui_end(taskbar);
    }

    /* ---- launcher menu ---- */
    if (launcher_open && !launcher) {
      int height = 62 + app_count * 34;

      launcher = ui_window_open("launcher", MENU_WIDTH, height,
                                GUI_TOP | GUI_NODECOR | GUI_NOTASKBAR);
      if (launcher)
        ui_move(launcher, 8, screen_h - TASKBAR_HEIGHT - height - 4);
    } else if (!launcher_open && launcher) {
      ui_window_close(launcher);
      launcher = NULL;
    }

    if (launcher) {
      if (ui_begin(launcher)) {
        draw_launcher(launcher, &launch_index);
        ui_end(launcher);
      } else {
        launcher_open = 0;
      }
    }

    /* ---- start whatever was chosen ---- */
    if (launch_index >= 0 && launch_index < app_count) {
      const char *args[1];
      int pid;

      args[0] = apps[launch_index].name;
      pid = spawn(apps[launch_index].path, 1, args);
      if (pid > 0 && running_count < 16)
        running_pids[running_count++] = pid;

      launcher_open = 0;
      taskbar->dirty = 1;
    }

    /* ---- pick up settings changes ---- */
    {
      static int last_config_check;

      if (uptime_ms() - last_config_check > 1000) {
        last_config_check = uptime_ms();
        if (reload_config())
          wallpaper->dirty = 1;
      }
    }

    /* ---- collect finished applications ---- */
    for (int i = 0; i < running_count; i++) {
      int status;

      if (try_wait(running_pids[i], &status) != 0) {
        running_pids[i] = running_pids[--running_count];
        i--;
        taskbar->dirty = 1;
      }
    }

    ui_frame_wait();
  }

  return 0;
}
