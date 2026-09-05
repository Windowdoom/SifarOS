#!/usr/bin/env bash
# Helpers for driving the desktop from the QEMU monitor.
#
# Absolute positioning: slam the cursor into the top left corner first, then
# move by exactly the coordinates we want.  The PS/2 mouse only reports
# relative movement, so this is the only way to be sure where we are.
# The PS/2 mouse only reports relative movement and QEMU chops a large move
# into a burst of packets that can overrun the controller queue, so track the
# cursor here and travel in short hops.
CURSOR_X=${CURSOR_X:-512}
CURSOR_Y=${CURSOR_Y:-384}
STEP=${STEP:-90}

move_to() {
    local target_x=$1 target_y=$2

    while [ "$CURSOR_X" -ne "$target_x" ] || [ "$CURSOR_Y" -ne "$target_y" ]; do
        local dx=$(( target_x - CURSOR_X ))
        local dy=$(( target_y - CURSOR_Y ))

        [ "$dx" -gt "$STEP" ] && dx=$STEP
        [ "$dx" -lt "-$STEP" ] && dx=-$STEP
        [ "$dy" -gt "$STEP" ] && dy=$STEP
        [ "$dy" -lt "-$STEP" ] && dy=-$STEP

        echo "mouse_move $dx $dy"
        sleep 0.06
        CURSOR_X=$(( CURSOR_X + dx ))
        CURSOR_Y=$(( CURSOR_Y + dy ))
    done
    sleep 0.15
}

click_at() {
    move_to "$1" "$2"
    echo "mouse_button 1"
    sleep 0.2
    echo "mouse_button 0"
    sleep 0.25
}

double_click_at() {
    move_to "$1" "$2"
    echo "mouse_button 1"
    sleep 0.1
    echo "mouse_button 0"
    sleep 0.15
    echo "mouse_button 1"
    sleep 0.1
    echo "mouse_button 0"
    sleep 0.3
}

type_text() {
    local text="$1"
    local i char
    for (( i=0; i<${#text}; i++ )); do
        char="${text:i:1}"
        case "$char" in
            " ") echo "sendkey spc" ;;
            "/") echo "sendkey slash" ;;
            ".") echo "sendkey dot" ;;
            "-") echo "sendkey minus" ;;
            "_") echo "sendkey shift-minus" ;;
            ",") echo "sendkey comma" ;;
            "=") echo "sendkey equal" ;;
            [a-z0-9]) echo "sendkey $char" ;;
            [A-Z]) echo "sendkey shift-$(echo "$char" | tr 'A-Z' 'a-z')" ;;
            *) ;;
        esac
        sleep 0.03
    done
}
