#ifndef _SEMANTIC_INPUT_H
#define _SEMANTIC_INPUT_H

/*
 * Semantic input bridge.
 *
 * Applications should increasingly consume intent instead of hardware-shaped
 * key codes. Today these actions are synthesized from the existing GUI event
 * state. A future gaze, voice, switch, touch or EMG provider can map to the
 * same actions without forcing application rewrites.
 */
#include "ui.h"

enum sifar_action {
    SIFAR_ACTION_NONE = 0,
    SIFAR_ACTION_ACTIVATE,
    SIFAR_ACTION_BACK,
    SIFAR_ACTION_NEXT,
    SIFAR_ACTION_PREVIOUS,
    SIFAR_ACTION_UP,
    SIFAR_ACTION_DOWN,
    SIFAR_ACTION_LEFT,
    SIFAR_ACTION_RIGHT,
    SIFAR_ACTION_SCROLL_UP,
    SIFAR_ACTION_SCROLL_DOWN,
};

static inline __attribute__((unused)) int
sifar_action_present(const ui_window *w, enum sifar_action action)
{
    if (!w)
        return 0;

    switch (action) {
    case SIFAR_ACTION_ACTIVATE:
        for (int i = 0; i < w->key_count; i++)
            if (w->keys[i] == GUI_KEY_ENTER)
                return 1;
        return w->mouse_released;
    case SIFAR_ACTION_BACK:
        for (int i = 0; i < w->key_count; i++)
            if (w->keys[i] == GUI_KEY_ESCAPE)
                return 1;
        return 0;
    case SIFAR_ACTION_NEXT:
        for (int i = 0; i < w->key_count; i++)
            if (w->keys[i] == GUI_KEY_TAB)
                return 1;
        return 0;
    case SIFAR_ACTION_PREVIOUS:
        return 0; /* reserved for Shift-Tab once modifier events are exposed */
    case SIFAR_ACTION_UP:
        for (int i = 0; i < w->key_count; i++)
            if (w->keys[i] == GUI_KEY_UP)
                return 1;
        return 0;
    case SIFAR_ACTION_DOWN:
        for (int i = 0; i < w->key_count; i++)
            if (w->keys[i] == GUI_KEY_DOWN)
                return 1;
        return 0;
    case SIFAR_ACTION_LEFT:
        for (int i = 0; i < w->key_count; i++)
            if (w->keys[i] == GUI_KEY_LEFT)
                return 1;
        return 0;
    case SIFAR_ACTION_RIGHT:
        for (int i = 0; i < w->key_count; i++)
            if (w->keys[i] == GUI_KEY_RIGHT)
                return 1;
        return 0;
    case SIFAR_ACTION_SCROLL_UP:
        return w->wheel > 0;
    case SIFAR_ACTION_SCROLL_DOWN:
        return w->wheel < 0;
    case SIFAR_ACTION_NONE:
    default:
        return 0;
    }
}

#endif
