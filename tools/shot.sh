#!/usr/bin/env bash
# Boot the image, optionally drive some input, then save a screenshot as PNG.
#
#   tools/shot.sh out.png [seconds] [monitor commands...]
#
# Extra arguments are QEMU monitor commands (sendkey, mouse_move, ...) issued
# after the wait, which is how the GUI is tested without a human at the screen.
set -uo pipefail

cd "$(dirname "$0")/.."

OUT=${1:-build/screen.png}
WAIT=${2:-6}
shift 2 2>/dev/null || shift $# 
PPM=$(mktemp /tmp/sifaros-shot-XXXX.ppm)
SERIAL=${SERIAL:-build/shot-serial.log}
MEMORY=${MEMORY:-512}

mkdir -p "$(dirname "$OUT")"

{
    sleep "$WAIT"
    for command in "$@"; do
        echo "$command"
        sleep 0.25
    done
    sleep 1
    echo "screendump $PPM"
    sleep 1.5
    echo "quit"
} | timeout 180 qemu-system-i386 \
        -drive "format=raw,file=build/sifaros.img" \
        -m "$MEMORY" \
        -display none \
        -monitor stdio \
        -serial "file:$SERIAL" \
        -no-reboot > /dev/null 2>&1

if [ ! -s "$PPM" ]; then
    echo "no screenshot captured" >&2
    exit 1
fi

python3 - "$PPM" "$OUT" <<'PYEOF'
import struct, sys, zlib

source, target = sys.argv[1], sys.argv[2]
data = open(source, 'rb').read()
header, dimensions, _maxval, pixels = data.split(b'\n', 3)
assert header == b'P6', header
width, height = map(int, dimensions.split())

raw = b''.join(b'\x00' + pixels[y * width * 3:(y + 1) * width * 3]
               for y in range(height))

def chunk(tag, payload):
    return (struct.pack('>I', len(payload)) + tag + payload +
            struct.pack('>I', zlib.crc32(tag + payload) & 0xFFFFFFFF))

png = (b'\x89PNG\r\n\x1a\n' +
       chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) +
       chunk(b'IDAT', zlib.compress(raw, 9)) +
       chunk(b'IEND', b''))
open(target, 'wb').write(png)
print(f"{target}: {width}x{height}")
PYEOF

rm -f "$PPM"
