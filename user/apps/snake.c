/*
 * Snake.  Arrow keys or WASD, space to pause, enter to start again.
 */
#include "ui.h"

#define CELL   20
#define GRID_W 28
#define GRID_H 20
#define TOP    40
#define MAX_LENGTH (GRID_W * GRID_H)

static int snake_x[MAX_LENGTH], snake_y[MAX_LENGTH];
static int length;
static int direction;                   /* 0 right, 1 down, 2 left, 3 up */
static int next_direction;
static int food_x, food_y;
static int score, best;
static int dead, paused;
static unsigned random_state = 12345;

static unsigned next_random(void)
{
    random_state = random_state * 1103515245u + 12345u;
    return (random_state >> 16) & 0x7FFF;
}

static void place_food(void)
{
    for (;;) {
        int ok = 1;

        food_x = (int)(next_random() % GRID_W);
        food_y = (int)(next_random() % GRID_H);
        for (int i = 0; i < length; i++) {
            if (snake_x[i] == food_x && snake_y[i] == food_y)
                ok = 0;
        }
        if (ok)
            return;
    }
}

static void reset(void)
{
    length = 4;
    for (int i = 0; i < length; i++) {
        snake_x[i] = 6 - i;
        snake_y[i] = GRID_H / 2;
    }
    direction = next_direction = 0;
    score = 0;
    dead = 0;
    paused = 0;
    random_state ^= (unsigned)uptime_ms();
    place_food();
}

static void step(void)
{
    int head_x, head_y;

    direction = next_direction;
    head_x = snake_x[0] + ((direction == 0) ? 1 : (direction == 2) ? -1 : 0);
    head_y = snake_y[0] + ((direction == 1) ? 1 : (direction == 3) ? -1 : 0);

    if (head_x < 0 || head_y < 0 || head_x >= GRID_W || head_y >= GRID_H) {
        dead = 1;
        return;
    }
    for (int i = 0; i < length; i++) {
        if (snake_x[i] == head_x && snake_y[i] == head_y) {
            dead = 1;
            return;
        }
    }

    for (int i = length; i > 0; i--) {
        snake_x[i] = snake_x[i - 1];
        snake_y[i] = snake_y[i - 1];
    }
    snake_x[0] = head_x;
    snake_y[0] = head_y;

    if (head_x == food_x && head_y == food_y) {
        if (length < MAX_LENGTH - 1)
            length++;
        score += 10;
        if (score > best)
            best = score;
        place_food();
    }
}

int main(int argc, char **argv)
{
    ui_window *window;
    int last_step = 0;
    int interval = 120;

    ui_init();
    window = ui_window_open("Snake", GRID_W * CELL, GRID_H * CELL + TOP, GUI_FIXED);
    if (!window)
        return 1;

    reset();

    while (ui_begin(window)) {
        int now = uptime_ms();

        for (int i = 0; i < window->key_count; i++) {
            switch (window->keys[i]) {
            case GUI_KEY_RIGHT: case 'd': if (direction != 2) next_direction = 0; break;
            case GUI_KEY_DOWN:  case 's': if (direction != 3) next_direction = 1; break;
            case GUI_KEY_LEFT:  case 'a': if (direction != 0) next_direction = 2; break;
            case GUI_KEY_UP:    case 'w': if (direction != 1) next_direction = 3; break;
            case ' ':           paused = !paused; break;
            case GUI_KEY_ENTER: if (dead) reset(); break;
            default: break;
            }
        }

        if (!dead && !paused && now - last_step >= interval) {
            last_step = now;
            step();
            window->dirty = 1;
        }

        if (!window->dirty) {
            ui_end(window);
            ui_frame_wait();
            continue;
        }

        /* Header */
        ui_fill(window, 0, 0, window->width, TOP, UI_PANEL);
        {
            char line[64];

            snprintf(line, sizeof(line), "score %d", score);
            ui_text_scaled(window, 12, 10, line, UI_TEXT, 1);
            snprintf(line, sizeof(line), "best %d", best);
            ui_text(window, 140, 10, line, UI_TEXT_DIM);
            ui_text(window, window->width - 210, 10,
                    dead ? "enter to play again" :
                    (paused ? "paused, space to resume" : "arrows or wasd"),
                    dead ? UI_WARN : UI_TEXT_DIM);
        }

        /* Board */
        ui_fill(window, 0, TOP, window->width, window->height - TOP, 0xFF12181F);
        for (int y = 0; y < GRID_H; y++) {
            for (int x = 0; x < GRID_W; x++) {
                if ((x + y) % 2 == 0)
                    ui_fill(window, x * CELL, TOP + y * CELL, CELL, CELL, 0xFF151C25);
            }
        }

        ui_round_fill(window, food_x * CELL + 3, TOP + food_y * CELL + 3,
                      CELL - 6, CELL - 6, 5, UI_BAD);

        for (int i = length - 1; i >= 0; i--) {
            uint32_t color = (i == 0) ? UI_RGB(0x90, 0xE8, 0xA8) : UI_RGB(0x48, 0xB0, 0x70);

            ui_round_fill(window, snake_x[i] * CELL + 2, TOP + snake_y[i] * CELL + 2,
                          CELL - 4, CELL - 4, 4, color);
        }

        if (dead) {
            int box_w = 260, box_h = 90;
            int x = (window->width - box_w) / 2;
            int y = (window->height - box_h) / 2;

            ui_blend(window, 0, TOP, window->width, window->height - TOP,
                     UI_RGBA(0, 0, 0, 140));
            ui_round_fill(window, x, y, box_w, box_h, 8, UI_PANEL);
            ui_frame(window, x, y, box_w, box_h, UI_BORDER);
            ui_text_center(window, x, y + 22, box_w, "game over", UI_BAD);
            ui_text_center(window, x, y + 50, box_w, "press enter to play again",
                           UI_TEXT_DIM);
        }

        ui_end(window);
        ui_frame_wait();
    }

    ui_window_close(window);
    return 0;
}
