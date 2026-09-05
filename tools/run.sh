#!/usr/bin/env bash
# Boot the SifarOS disk image in QEMU.
#
#   tools/run.sh              graphical window if one is available, else serial
#   tools/run.sh --serial     headless, console on this terminal
#   tools/run.sh --debug      wait for gdb on localhost:1234
#   tools/run.sh --curses     text mode VGA in the terminal
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE=${IMAGE:-build/sifaros.img}
MEMORY=${MEMORY:-128}
QEMU=${QEMU:-qemu-system-i386}

if [ ! -f "$IMAGE" ]; then
    echo "$IMAGE not found, run make first" >&2
    exit 1
fi

ARGS=(-drive "format=raw,file=$IMAGE" -m "$MEMORY" -no-reboot -boot c)
MODE=${1:-auto}

case "$MODE" in
    --serial)
        ARGS+=(-display none -serial mon:stdio)
        echo "SifarOS on the serial console. Quit with Ctrl-A then X."
        ;;
    --curses)
        ARGS+=(-display curses -serial null)
        ;;
    --debug)
        ARGS+=(-display none -serial mon:stdio -s -S)
        echo "Waiting for gdb: target remote localhost:1234"
        ;;
    auto|"")
        if [ -n "${DISPLAY:-}" ]; then
            ARGS+=(-serial mon:stdio)
        else
            ARGS+=(-display none -serial mon:stdio)
            echo "No display available, using the serial console. Quit with Ctrl-A then X."
        fi
        ;;
    *)
        echo "unknown option: $MODE" >&2
        exit 2
        ;;
esac

exec "$QEMU" "${ARGS[@]}"
