/*
 * Sifar Web 2.0 overhaul.
 *
 * A capability-confined native browser surface. It uses the bounded kernel
 * HTTP service, follows a small number of plain-HTTP redirects, renders a safe
 * text view of HTML and stops at HTTPS rather than inventing or downgrading
 * cryptography. TLS will enter through a vetted service in a later milestone.
 */
#include "future_ui.h"

#define WINDOW_W 920
#define WINDOW_H 660
#define URL_CAP 640
#define RESPONSE_CAP (48u * 1024u)
#define DOCUMENT_CAP (32u * 1024u)
#define MAX_REDIRECTS 5

static char url[URL_CAP] = "http://example.com/";
static char status_text[192] = "Ready";
static char security_text[48] = "HTTP";
static char *response;
static char *document;
static size_t document_len;
static int scroll_line;
static int request_bytes;
static int redirect_count;

static int lower_char(int c)
{
    if (c >= 'A' && c <= 'Z')
        return c + ('a' - 'A');
    return c;
}

static int starts_ci(const char *text, const char *prefix)
{
    while (*prefix) {
        if (!*text || lower_char((unsigned char)*text) !=
                          lower_char((unsigned char)*prefix))
            return 0;
        text++;
        prefix++;
    }
    return 1;
}

static void set_status(const char *text)
{
    strlcpy(status_text, text, sizeof(status_text));
}

static int parse_url(const char *input, char *host, size_t host_cap,
                     uint16_t *port, char *path, size_t path_cap)
{
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
    if (!host_len || host_len >= host_cap)
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

static void append_char(char c)
{
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

static void document_message(const char *title, const char *detail)
{
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

static int entity(const char *p, char *out, int *used)
{
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

static int tag_named(const char *tag, const char *name)
{
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

static int block_tag(const char *tag)
{
    return tag_named(tag, "br") || tag_named(tag, "p") ||
           tag_named(tag, "div") || tag_named(tag, "li") ||
           tag_named(tag, "h1") || tag_named(tag, "h2") ||
           tag_named(tag, "h3") || tag_named(tag, "h4") ||
           tag_named(tag, "tr") || tag_named(tag, "title");
}

static void html_to_text(const char *body, size_t length)
{
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
                             size_t status_cap)
{
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

    return body_at < 0 ? raw : raw + body_at;
}

static int find_header(const char *raw, int length, const char *name,
                       char *out, size_t out_cap)
{
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
            starts_ci(raw + line_start, name) &&
            raw[line_start + name_len] == ':') {
            int value = line_start + (int)name_len + 1;
            size_t take;

            while (value < line_end &&
                   (raw[value] == ' ' || raw[value] == '\t'))
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

static int response_code(const char *status)
{
    const char *space = strchr(status, ' ');
    return space ? atoi(space + 1) : 0;
}

static int make_redirect_url(char *out, size_t out_cap, const char *location,
                             const char *host, uint16_t port)
{
    if (starts_ci(location, "http://") || starts_ci(location, "https://")) {
        strlcpy(out, location, out_cap);
        return 0;
    }

    if (location[0] == '/') {
        if (port == 80)
            snprintf(out, out_cap, "http://%s%s", host, location);
        else
            snprintf(out, out_cap, "http://%s:%u%s", host,
                     (unsigned)port, location);
        return 0;
    }

    return -1;
}

static void load_page(void)
{
    char host[NET_HOST_MAX];
    char path[NET_PATH_MAX];
    char http_status[96];
    char location[URL_CAP];
    char next_url[URL_CAP];
    uint16_t port;

    redirect_count = 0;
    request_bytes = 0;

    for (int redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
        int parsed = parse_url(url, host, sizeof(host), &port,
                               path, sizeof(path));
        int n;
        int code;
        const char *body;
        size_t body_len;

        if (parsed == -2) {
            strlcpy(security_text, "HTTPS pending", sizeof(security_text));
            set_status("Secure web requires the upcoming vetted TLS service");
            document_message("Secure connection required",
                             "Sifar Web will not downgrade HTTPS to plain HTTP.");
            return;
        }
        if (parsed < 0) {
            strlcpy(security_text, "Invalid address", sizeof(security_text));
            set_status("Enter an HTTP address or host/path");
            document_message("Address not understood", url);
            return;
        }

        strlcpy(security_text, "HTTP", sizeof(security_text));
        set_status(redirects ? "Following redirect..." : "Loading...");
        n = http_get(host, port, path, response, RESPONSE_CAP);

        if (n < 0) {
            if (n == -10)
                set_status("Adaptive Core paused new network transactions");
            else if (n == -2)
                set_status("Network service is busy. Try again");
            else
                set_status("Request failed. Check the address and network");
            document_message("Could not load this page", status_text);
            return;
        }

        request_bytes += n;
        if ((size_t)n >= RESPONSE_CAP)
            n = RESPONSE_CAP - 1;
        response[n] = '\0';

        body = find_body(response, n, http_status, sizeof(http_status));
        body_len = (size_t)n - (size_t)(body - response);
        code = response_code(http_status);

        if (code >= 300 && code < 400 &&
            find_header(response, n, "Location", location, sizeof(location))) {
            redirect_count++;

            if (make_redirect_url(next_url, sizeof(next_url), location,
                                  host, port) < 0) {
                snprintf(status_text, sizeof(status_text),
                         "%s | unsupported redirect", http_status);
                document_message("Redirect target not understood", location);
                return;
            }

            strlcpy(url, next_url, sizeof(url));
            if (starts_ci(url, "https://")) {
                strlcpy(security_text, "HTTPS pending", sizeof(security_text));
                snprintf(status_text, sizeof(status_text),
                         "%d redirect to secure web", code);
                document_message("This site moved to HTTPS", url);
                return;
            }
            continue;
        }

        html_to_text(body, body_len);
        scroll_line = 0;
        snprintf(status_text, sizeof(status_text), "%s | %d bytes",
                 http_status, n);
        return;
    }

    set_status("Too many redirects");
    document_message("Navigation stopped",
                     "The site redirected more than five times.");
}

static int document_lines(int columns)
{
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

static void draw_document(ui_window *w, int x, int y, int width, int height)
{
    int columns = (width - 32) / UI_GLYPH_W;
    int visible = (height - 62) / 19;
    int logical_line = 0;
    int shown = 0;
    int column = 0;
    char line[128];

    fu_card(w, x, y, width, height);
    fu_text(w, x + 18, y + 16, "PAGE", UI_TEXT_DIM);
    ui_fill(w, x + 18, y + 42, width - 36, 1, UI_BORDER);

    if (columns > (int)sizeof(line) - 1)
        columns = (int)sizeof(line) - 1;
    if (columns < 8)
        return;

    for (size_t i = 0; i <= document_len && shown < visible; i++) {
        char c = i < document_len ? document[i] : '\n';

        if (c != '\n' && column < columns) {
            line[column++] = c;
            if (column < columns)
                continue;
        }

        line[column] = '\0';
        if (logical_line >= scroll_line) {
            ui_text(w, x + 18, y + 52 + shown * 19, line, UI_TEXT);
            shown++;
        }
        logical_line++;
        column = 0;
    }

    if (!document_len)
        fu_text_center(w, x, y + height / 2 - 8, width,
                       "Enter an address above", UI_TEXT_DIM);
}

static void draw_shell(ui_window *w, const struct net_info *net)
{
    char network[64];
    char transfer[64];
    uint32_t security_color = starts_ci(security_text, "HTTP")
                                  ? UI_WARN
                                  : UI_BAD;

    if (net && net->ready)
        snprintf(network, sizeof(network), "online %u.%u.%u.%u",
                 net->ipv4[0], net->ipv4[1], net->ipv4[2], net->ipv4[3]);
    else
        strlcpy(network, "offline", sizeof(network));

    snprintf(transfer, sizeof(transfer), "%d B | %d redirect%s",
             request_bytes, redirect_count, redirect_count == 1 ? "" : "s");

    ui_gradient(w, 0, 0, w->width, w->height,
                UI_RGB(0x06, 0x0A, 0x12), UI_RGB(0x0A, 0x13, 0x22));
    ui_blend(w, w->width / 2, 0, w->width / 2, 180,
             UI_RGBA(0x4F, 0x7D, 0xF3, 16));

    fu_text(w, 24, 20, "SIFAR WEB", UI_ACCENT_LIGHT);
    ui_text_scaled(w, 24, 43, "A calmer web surface", UI_TEXT, 2);
    fu_chip(w, w->width - 182, 22, network,
            net && net->ready ? UI_GOOD : UI_BAD);

    fu_card(w, 24, 92, w->width - 48, 84);
    if (fu_button(w, 40, 116, 46, 36, "R", UI_ACCENT))
        load_page();

    if (fu_textbox(w, 98, 116, w->width - 250, url, sizeof(url)))
        load_page();

    if (fu_button(w, w->width - 136, 116, 96, 36, "Go", UI_ACCENT))
        load_page();

    fu_chip(w, 40, 184, security_text, security_color);
    fu_text(w, 178, 189, status_text, UI_TEXT_DIM);
    fu_text(w, w->width - 210, 189, transfer, UI_TEXT_DIM);

    draw_document(w, 24, 222, w->width - 48, w->height - 246);
}

int main(int argc, char **argv)
{
    ui_window *window;
    struct net_info net;

    (void)argc;
    (void)argv;

    ui_init();
    fu_init();

    response = malloc(RESPONSE_CAP + 1);
    document = malloc(DOCUMENT_CAP + 1);
    if (!response || !document)
        return 1;

    document[0] = '\0';
    window = ui_window_open("Sifar Web", WINDOW_W, WINDOW_H, GUI_NORMAL);
    if (!window)
        return 1;

    memset(&net, 0, sizeof(net));
    if (network_info(&net) < 0)
        net.ready = 0;

    document_message("A web browser that respects the trust boundary",
                     "Plain HTTP works today. HTTPS waits for vetted TLS, not a downgrade.");

    while (ui_begin(window)) {
        int columns;
        int lines;
        int visible;

        if (window->wheel) {
            columns = (window->width - 80) / UI_GLYPH_W;
            visible = (window->height - 310) / 19;
            lines = document_lines(columns);
            scroll_line -= window->wheel * 3;
            if (scroll_line < 0)
                scroll_line = 0;
            if (scroll_line > lines - visible)
                scroll_line = lines > visible ? lines - visible : 0;
            window->dirty = 1;
        }

        if (window->dirty)
            draw_shell(window, &net);

        ui_end(window);
        ui_frame_wait();
    }

    ui_window_close(window);
    free(document);
    free(response);
    return 0;
}
