/*
 * Sifar Web.
 *
 * A deliberately small native browser for SifarOS 2.0. It uses the bounded
 * kernel HTTP service rather than raw sockets, renders a safe text view of
 * HTML, and refuses HTTPS instead of silently downgrading encrypted URLs.
 */
#include "ui.h"

#define WINDOW_W 900
#define WINDOW_H 640
#define URL_CAP 640
#define RESPONSE_CAP (48u * 1024u)
#define DOCUMENT_CAP (32u * 1024u)

static char url[URL_CAP] = "http://example.com/";
static char status_text[192] = "Ready";
static char security_text[48] = "HTTP";
static char redirect_text[URL_CAP];
static char *response;
static char *document;
static size_t document_len;
static int scroll_line;

static int lower_char(int c) {
  if (c >= 'A' && c <= 'Z')
    return c + ('a' - 'A');
  return c;
}

static int starts_ci(const char *text, const char *prefix) {
  while (*prefix) {
    if (!*text || lower_char((unsigned char)*text) !=
                      lower_char((unsigned char)*prefix))
      return 0;
    text++;
    prefix++;
  }
  return 1;
}

static void set_status(const char *text) {
  strlcpy(status_text, text, sizeof(status_text));
}

static int parse_url(const char *input, char *host, size_t host_cap,
                     uint16_t *port, char *path, size_t path_cap) {
  const char *p = input;
  const char *host_start;
  const char *slash;
  const char *colon = NULL;
  size_t host_len;

  if (starts_ci(p, "https://"))
    return -2;
  if (starts_ci(p, "http://"))
    p += 7;

  host_start = p;
  slash = strchr(p, '/');
  if (!slash)
    slash = p + strlen(p);

  for (const char *q = host_start; q < slash; q++) {
    if (*q == ':')
      colon = q;
  }

  host_len = (size_t)((colon ? colon : slash) - host_start);
  if (host_len == 0 || host_len >= host_cap)
    return -1;
  memcpy(host, host_start, host_len);
  host[host_len] = '\0';

  *port = 80;
  if (colon) {
    int parsed = atoi(colon + 1);
    if (parsed <= 0 || parsed > 65535)
      return -1;
    *port = (uint16_t)parsed;
  }

  if (*slash)
    strlcpy(path, slash, path_cap);
  else
    strlcpy(path, "/", path_cap);
  if (strlen(path) + 1 >= path_cap)
    return -1;
  return 0;
}

static void append_char(char c) {
  if (!document || document_len + 1 >= DOCUMENT_CAP)
    return;

  if (c == '\r')
    return;
  if (c == '\t')
    c = ' ';

  if (c == '\n') {
    while (document_len && document[document_len - 1] == ' ')
      document_len--;
    if (!document_len || document[document_len - 1] != '\n')
      document[document_len++] = '\n';
    return;
  }

  if (c == ' ') {
    if (!document_len || document[document_len - 1] == ' ' ||
        document[document_len - 1] == '\n')
      return;
  }

  if ((unsigned char)c < 32)
    return;
  document[document_len++] = c;
}

static void document_message(const char *title, const char *detail) {
  document_len = 0;
  if (title) {
    for (const char *p = title; *p; p++)
      append_char(*p);
    append_char('\n');
    append_char('\n');
  }
  if (detail) {
    for (const char *p = detail; *p; p++)
      append_char(*p);
  }
  document[document_len] = '\0';
  scroll_line = 0;
}

static int entity(const char *p, char *out, int *used) {
  if (strncmp(p, "&amp;", 5) == 0) {
    *out = '&';
    *used = 5;
    return 1;
  }
  if (strncmp(p, "&lt;", 4) == 0) {
    *out = '<';
    *used = 4;
    return 1;
  }
  if (strncmp(p, "&gt;", 4) == 0) {
    *out = '>';
    *used = 4;
    return 1;
  }
  if (strncmp(p, "&quot;", 6) == 0) {
    *out = '"';
    *used = 6;
    return 1;
  }
  if (strncmp(p, "&#39;", 5) == 0) {
    *out = '\'';
    *used = 5;
    return 1;
  }
  if (strncmp(p, "&nbsp;", 6) == 0) {
    *out = ' ';
    *used = 6;
    return 1;
  }
  return 0;
}

static int tag_named(const char *tag, const char *name) {
  if (*tag == '/')
    tag++;
  while (*tag == ' ' || *tag == '\t')
    tag++;
  while (*name) {
    if (!*tag || lower_char((unsigned char)*tag) !=
                     lower_char((unsigned char)*name))
      return 0;
    tag++;
    name++;
  }
  return *tag == '>' || *tag == '/' || *tag == ' ' || *tag == '\t';
}

static int block_tag(const char *tag) {
  return tag_named(tag, "br") || tag_named(tag, "p") ||
         tag_named(tag, "div") || tag_named(tag, "li") ||
         tag_named(tag, "h1") || tag_named(tag, "h2") ||
         tag_named(tag, "h3") || tag_named(tag, "h4") ||
         tag_named(tag, "tr") || tag_named(tag, "title");
}

static void html_to_text(const char *body, size_t length) {
  size_t i = 0;
  int hidden = 0;

  document_len = 0;
  while (i < length && document_len + 1 < DOCUMENT_CAP) {
    if (body[i] == '<') {
      size_t end = i + 1;
      while (end < length && body[end] != '>' && end - i < 256)
        end++;
      if (end >= length || body[end] != '>') {
        i++;
        continue;
      }

      if (tag_named(body + i + 1, "script"))
        hidden = body[i + 1] == '/' ? 0 : 1;
      else if (tag_named(body + i + 1, "style"))
        hidden = body[i + 1] == '/' ? 0 : 1;
      else if (!hidden && block_tag(body + i + 1))
        append_char('\n');

      i = end + 1;
      continue;
    }

    if (!hidden && body[i] == '&') {
      char decoded;
      int used;
      if (entity(body + i, &decoded, &used)) {
        append_char(decoded);
        i += (size_t)used;
        continue;
      }
    }

    if (!hidden) {
      char c = body[i];
      if (c == '\n' || c == '\r' || c == '\t')
        c = ' ';
      append_char(c);
    }
    i++;
  }

  while (document_len &&
         (document[document_len - 1] == ' ' ||
          document[document_len - 1] == '\n'))
    document_len--;
  document[document_len] = '\0';
}

static const char *find_body(char *raw, int length, char *status,
                             size_t status_cap) {
  int line_end = -1;
  int body_at = -1;

  for (int i = 0; i + 1 < length; i++) {
    if (line_end < 0 && raw[i] == '\r' && raw[i + 1] == '\n')
      line_end = i;
    if (i + 3 < length && raw[i] == '\r' && raw[i + 1] == '\n' &&
        raw[i + 2] == '\r' && raw[i + 3] == '\n') {
      body_at = i + 4;
      break;
    }
  }

  if (line_end > 0) {
    size_t take = (size_t)line_end;
    if (take >= status_cap)
      take = status_cap - 1;
    memcpy(status, raw, take);
    status[take] = '\0';
  } else {
    strlcpy(status, "HTTP response", status_cap);
  }

  if (body_at < 0)
    return raw;
  return raw + body_at;
}

static int find_header(const char *raw, int length, const char *name, char *out,
                       size_t out_cap) {
  size_t name_len = strlen(name);
  int i = 0;

  while (i < length) {
    int line_start = i;
    int line_end = i;

    while (line_end + 1 < length &&
           !(raw[line_end] == '\r' && raw[line_end + 1] == '\n'))
      line_end++;
    if (line_end == line_start)
      break;

    if ((size_t)(line_end - line_start) > name_len &&
        starts_ci(raw + line_start, name) && raw[line_start + name_len] == ':') {
      int value = line_start + (int)name_len + 1;
      size_t take;
      while (value < line_end && (raw[value] == ' ' || raw[value] == '\t'))
        value++;
      take = (size_t)(line_end - value);
      if (take >= out_cap)
        take = out_cap - 1;
      memcpy(out, raw + value, take);
      out[take] = '\0';
      return 1;
    }

    i = line_end + 2;
  }
  return 0;
}

static int response_code(const char *status) {
  const char *space = strchr(status, ' ');
  if (!space)
    return 0;
  return atoi(space + 1);
}

static void load_page(void) {
  char host[NET_HOST_MAX];
  char path[NET_PATH_MAX];
  char http_status[96];
  uint16_t port;
  int parsed;
  int n;
  int code;
  const char *body;
  size_t body_len;

  redirect_text[0] = '\0';
  parsed = parse_url(url, host, sizeof(host), &port, path, sizeof(path));
  if (parsed == -2) {
    strlcpy(security_text, "TLS required", sizeof(security_text));
    set_status("HTTPS is blocked until SifarOS has a vetted TLS stack");
    document_message("Secure connection required",
                     "Sifar Web will never downgrade an HTTPS address to HTTP.");
    return;
  }
  if (parsed < 0) {
    strlcpy(security_text, "Invalid URL", sizeof(security_text));
    set_status("Use http://host/path or host/path");
    document_message("Address not understood", url);
    return;
  }

  strlcpy(security_text, "HTTP", sizeof(security_text));
  set_status("Loading...");
  n = http_get(host, port, path, response, RESPONSE_CAP);
  if (n < 0) {
    if (n == -10)
      set_status("Network paused by Sifar Adaptive Core defensive mode");
    else if (n == -2)
      set_status("Network service is busy. Try again");
    else
      set_status("Request failed. Check the network and HTTP address");
    document_message("Could not load this page", status_text);
    return;
  }

  if ((size_t)n >= RESPONSE_CAP)
    n = RESPONSE_CAP - 1;
  response[n] = '\0';
  body = find_body(response, n, http_status, sizeof(http_status));
  body_len = (size_t)n - (size_t)(body - response);
  code = response_code(http_status);

  if (code >= 300 && code < 400 &&
      find_header(response, n, "Location", redirect_text,
                  sizeof(redirect_text))) {
    if (starts_ci(redirect_text, "https://")) {
      strlcpy(security_text, "TLS required", sizeof(security_text));
      snprintf(status_text, sizeof(status_text), "%d redirect to secure web", code);
      document_message("This site moved to HTTPS", redirect_text);
      return;
    }
    snprintf(status_text, sizeof(status_text), "%s | redirect", http_status);
    document_message("Redirect", redirect_text);
    return;
  }

  html_to_text(body, body_len);
  scroll_line = 0;
  snprintf(status_text, sizeof(status_text), "%s | %d bytes", http_status, n);
}

static int document_lines(int columns) {
  int lines = 1;
  int column = 0;

  if (columns < 1)
    return 1;
  for (size_t i = 0; i < document_len; i++) {
    if (document[i] == '\n') {
      lines++;
      column = 0;
    } else {
      column++;
      if (column >= columns) {
        lines++;
        column = 0;
      }
    }
  }
  return lines;
}

static void draw_document(ui_window *w, int x, int y, int width, int height) {
  int columns = (width - 32) / UI_GLYPH_W;
  int visible = (height - 58) / 18;
  int logical_line = 0;
  int shown = 0;
  int column = 0;
  char line[128];

  if (columns > (int)sizeof(line) - 1)
    columns = (int)sizeof(line) - 1;
  if (columns < 8)
    return;

  ui_round_fill(w, x, y, width, height, 12, UI_PANEL);
  ui_frame(w, x, y, width, height, UI_BORDER);
  ui_text(w, x + 16, y + 12, "PAGE", UI_TEXT_DIM);
  ui_fill(w, x + 14, y + 38, width - 28, 1, UI_BORDER);

  for (size_t i = 0; i <= document_len && shown < visible; i++) {
    char c = i < document_len ? document[i] : '\n';
    if (c != '\n' && column < columns) {
      line[column++] = c;
      if (column < columns)
        continue;
    }

    line[column] = '\0';
    if (logical_line >= scroll_line) {
      ui_text(w, x + 16, y + 50 + shown * 18, line, UI_TEXT);
      shown++;
    }
    logical_line++;
    column = 0;
  }

  if (!document_len)
    ui_text_center(w, x, y + height / 2 - 8, width,
                   "Enter an HTTP address above", UI_TEXT_DIM);
}

static void draw_header(ui_window *w, const char *net_text) {
  uint32_t security_color = starts_ci(security_text, "HTTP") ? UI_WARN : UI_BAD;
  int net_w = ui_text_width(net_text) + 24;
  int sec_w = ui_text_width(security_text) + 24;

  ui_fill(w, 0, 0, w->width, 46, UI_PANEL);
  ui_fill(w, 0, 45, w->width, 1, UI_BORDER);

  ui_circle(w, 24, 22, 11, UI_ACCENT);
  ui_text(w, 20, 14, "S", UI_WHITE);
  ui_text(w, 44, 14, "Sifar Web", UI_WHITE);
  ui_text(w, 132, 14, "2.0", UI_TEXT_DIM);

  ui_round_fill(w, w->width - net_w - 18, 9, net_w, 28, 8, UI_SURFACE_ALT);
  ui_circle(w, w->width - net_w - 4, 23, 4,
            starts_ci(net_text, "online") ? UI_GOOD : UI_BAD);
  ui_text(w, w->width - net_w + 6, 15, net_text, UI_TEXT_DIM);

  ui_round_fill(w, 18, 54, 42, 32, 9, UI_SURFACE_ALT);
  ui_text_center(w, 18, 62, 42, "R", UI_TEXT_DIM);

  ui_round_fill(w, 68, 52, w->width - 180, 36, 10, UI_SURFACE_ALT);
  ui_textbox(w, 78, 58, w->width - 200, "", url, sizeof(url));

  ui_round_fill(w, w->width - 104, 52, 86, 36, 10, UI_ACCENT);
  ui_text_center(w, w->width - 104, 62, 86, "Go", UI_WHITE);

  ui_round_fill(w, 18, 98, sec_w, 26, 8, UI_SURFACE_ALT);
  ui_fill(w, 18, 98, 3, 26, security_color);
  ui_text(w, 30, 103, security_text, security_color);
  ui_text(w, 34 + sec_w, 103, status_text, UI_TEXT_DIM);
}

int main(int argc, char **argv) {
  ui_window *w;
  struct net_info info;
  char net_text[128];

  if (argc > 1)
    strlcpy(url, argv[1], sizeof(url));

  response = (char *)malloc(RESPONSE_CAP + 1);
  document = (char *)malloc(DOCUMENT_CAP);
  if (!response || !document)
    return 1;
  document[0] = '\0';

  if (ui_init() < 0)
    return 2;
  w = ui_window_open("Sifar Web", WINDOW_W, WINDOW_H, GUI_NORMAL);
  if (!w)
    return 3;

  if (network_info(&info) == 0 && info.ready) {
    snprintf(net_text, sizeof(net_text), "online %u.%u.%u.%u", info.ipv4[0],
             info.ipv4[1], info.ipv4[2], info.ipv4[3]);
  } else {
    strlcpy(net_text, "offline", sizeof(net_text));
  }

  if (argc > 1)
    load_page();

  while (ui_begin(w)) {
    int content_y = 136;
    int content_h = w->height - content_y - 18;
    int columns = (w->width - 68) / UI_GLYPH_W;
    int total_lines = document_lines(columns);
    int visible_lines = (content_h - 58) / 18;
    int max_scroll =
        total_lines > visible_lines ? total_lines - visible_lines : 0;

    ui_gradient(w, 0, 0, w->width, w->height, UI_BG, UI_RGB(0x0D, 0x14, 0x22));
    draw_header(w, net_text);

    if (ui_hit(w, 18, 54, 42, 32) && w->mouse_pressed)
      load_page();
    if (ui_hit(w, w->width - 104, 52, 86, 36) && w->mouse_pressed)
      load_page();
    if (w->focus && ui_key(w, GUI_KEY_ENTER))
      load_page();

    draw_document(w, 18, content_y, w->width - 36, content_h);

    if (w->wheel) {
      scroll_line -= w->wheel * 3;
      if (scroll_line < 0)
        scroll_line = 0;
      if (scroll_line > max_scroll)
        scroll_line = max_scroll;
      w->dirty = 1;
    }

    ui_end(w);
    ui_frame_wait();
  }

  ui_window_close(w);
  free(document);
  free(response);
  return 0;
}
