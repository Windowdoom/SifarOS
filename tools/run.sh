#!/usr/bin/env bash
# Boot SifarOS in QEMU.
#
#   tools/run.sh              graphical window when available, else serial
#   tools/run.sh --serial     headless, kernel console on this terminal
#   tools/run.sh --debug      wait for gdb on localhost:1234
#   tools/run.sh --curses     text mode in the terminal
#
# Environment: MEMORY (MiB), IMAGE, QEMU.
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE=${IMAGE:-build/sifaros.img}
MEMORY=${MEMORY:-512}
QEMU=${QEMU:-qemu-system-i386}
HOST_OS=$(uname -s 2>/dev/null || printf unknown)

if [ ! -f "$IMAGE" ]; then
    echo "$IMAGE not found, run make first" >&2
    exit 1
fi

ARGS=(-drive "format=raw,file=$IMAGE" -m "$MEMORY" -no-reboot -boot c)

# Hardware virtualisation makes the software compositor feel immediate rather
# than merely usable. Fall back quietly when it is not available. Genesis is
# i386, so Apple Silicon currently uses QEMU's software translation path.
if [ -w /dev/kvm ]; then
    ARGS+=(-accel kvm -cpu host)
fi

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
        # macOS does not normally set DISPLAY or WAYLAND_DISPLAY. QEMU's Cocoa
        # frontend is still graphical, so Darwin must be treated as a desktop.
        if [ "$HOST_OS" = "Darwin" ] || [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
            ARGS+=(-serial mon:stdio)
            echo "SifarOS is booting in a window."
            echo "Click inside it to give it the mouse."
            echo "This terminal remains the kernel console."
        else
            ARGS+=(-display none -serial mon:stdio)
            echo "No graphical session detected, using the serial console."
            echo "Quit with Ctrl-A then X."
        fi
        ;;
    *)
        echo "unknown option: $MODE" >&2
        exit 2
        ;;
esac

exec "$QEMU" "${ARGS[@]}"
