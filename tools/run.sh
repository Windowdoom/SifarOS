#!/usr/bin/env bash
# Boot SifarOS in QEMU.
#
#   tools/run.sh              a window if there is a display, else serial
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

if [ ! -f "$IMAGE" ]; then
    echo "$IMAGE not found, run make first" >&2
    exit 1
fi

# QEMU user networking gives the guest an isolated NAT environment without
# requiring root privileges or host configuration. SifarOS talks to a real
# emulated RTL8139 PCI NIC; there are no host-side browser/network callbacks.
ARGS=(-drive "format=raw,file=$IMAGE" -m "$MEMORY" -no-reboot -boot c
      -netdev user,id=sifarnet -device rtl8139,netdev=sifarnet)

# Hardware virtualisation makes the software compositor feel immediate rather
# than merely usable. Fall back quietly when it is not available. Apple
# Silicon runs the x86 guest through TCG, which still exposes PAE/NX.
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
        if [ "$(uname -s)" = "Darwin" ]; then
            ARGS+=(-display cocoa -serial mon:stdio)
            echo "SifarOS is booting in a QEMU window."
            echo "Click inside it to give it the mouse; Ctrl-Alt-G gives it back."
            echo "This terminal is the kernel console: type 'help' for its commands."
        elif [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
            ARGS+=(-serial mon:stdio)
            echo "SifarOS is booting in a window."
            echo "Click inside it to give it the mouse; Ctrl-Alt-G gives it back."
            echo "This terminal is the kernel console: type 'help' for its commands."
        else
            ARGS+=(-display none -serial mon:stdio)
            echo "No display, using the serial console. Quit with Ctrl-A then X."
        fi
        ;;
    *)
        echo "unknown option: $MODE" >&2
        exit 2
        ;;
esac

exec "$QEMU" "${ARGS[@]}"
