#!/usr/bin/env bash
# Drive the desktop the way a person would and check what comes back.
#
# QEMU's monitor gives us a mouse and a keyboard; screendump gives us the
# frame. The checks look at both the serial log (nothing crashed) and the
# pixels (the thing we asked for actually appeared).
set -uo pipefail

cd "$(dirname "$0")/.."
source tools/common.sh
source tools/gui-drive.sh

IMAGE=${IMAGE:-build/sifaros.img}
QEMU=${QEMU:-qemu-system-i386}
CPU=${CPU:-max}
SHOTS=${SHOTS:-build/shots}
SERIAL=${SERIAL:-build/gui-test.log}
MEMORY=${MEMORY:-512}
BOOT_WAIT=${BOOT_WAIT:-12}

mkdir -p "$SHOTS"
rm -f "$SHOTS"/*.ppm "$SHOTS"/*.png

# The disk keeps whatever the last session wrote, so rebuild the image unless
# the caller wants to test against the current one.
if [ "${FRESH:-1}" = "1" ]; then
    echo "rebuilding a clean disk image..."
    make >/dev/null || exit 1
fi

# Window geometry the window manager gives the first three application windows.
TERMINAL_TITLE_X=300
TERMINAL_TITLE_Y=46

session() {
    sleep "$BOOT_WAIT"
    echo "screendump $SHOTS/01-desktop.ppm"; sleep 1

    click_at 60 748                      # open the launcher
    sleep 1
    echo "screendump $SHOTS/02-launcher.ppm"; sleep 1

    click_at 68 696                      # Terminal, the last entry
    sleep 3
    echo "screendump $SHOTS/03-terminal.ppm"; sleep 1

    type_text "ls /apps"; echo "sendkey ret"; sleep 2

    # Settings goes second so the window manager cascades it to a known spot:
    # the client area lands at (88, 84) and the theme swatches with it.
    type_text "run settings"; echo "sendkey ret"; sleep 4
    echo "screendump $SHOTS/04-settings.ppm"; sleep 1

    # Two different themes, so the check compares like with like no matter
    # which one the disk happened to start with.
    click_at 181 202                     # Midnight
    sleep 2
    echo "screendump $SHOTS/05-theme-a.ppm"; sleep 1
    click_at 327 264                     # Ember
    sleep 2
    echo "screendump $SHOTS/05-theme-b.ppm"; sleep 1

    # Drag the settings window by its title bar.
    move_to 300 70
    echo "mouse_button 1"; sleep 0.3
    move_to 520 320
    echo "mouse_button 0"; sleep 0.5
    echo "screendump $SHOTS/06-dragged.ppm"; sleep 1

    click_at "$TERMINAL_TITLE_X" "$TERMINAL_TITLE_Y"
    sleep 1
    type_text "run editor /home/readme.txt"; echo "sendkey ret"; sleep 4
    echo "screendump $SHOTS/07-editor.ppm"; sleep 1

    click_at "$TERMINAL_TITLE_X" "$TERMINAL_TITLE_Y"
    sleep 1
    type_text "run snake"; echo "sendkey ret"; sleep 4
    echo "screendump $SHOTS/08-snake.ppm"; sleep 1

    click_at "$TERMINAL_TITLE_X" "$TERMINAL_TITLE_Y"
    sleep 1
    type_text "ps"; echo "sendkey ret"; sleep 2
    echo "screendump $SHOTS/09-processes.ppm"; sleep 1

    sleep 1
    echo quit
}

echo "booting the desktop and driving it..."
session | run_limited 300 "$QEMU" \
    -drive "format=raw,file=$IMAGE" \
    -m "$MEMORY" \
    -cpu "$CPU" \
    -display none \
    -monitor stdio \
    -serial "file:$SERIAL" \
    -no-reboot > /dev/null 2>&1

# ---- convert the frames and check them ------------------------------------
python3 - "$SHOTS" <<'PYEOF'
import os
import struct
import sys
import zlib

shots = sys.argv[1]
failures = 0
checks = 0


def load(name):
    path = os.path.join(shots, name)
    if not os.path.exists(path):
        return None
    data = open(path, 'rb').read()
    header, dimensions, _maxval, pixels = data.split(b'\n', 3)
    width, height = map(int, dimensions.split())
    return width, height, pixels


def to_png(name):
    frame = load(name)
    if not frame:
        return
    width, height, pixels = frame
    raw = b''.join(b'\x00' + pixels[y * width * 3:(y + 1) * width * 3]
                   for y in range(height))

    def chunk(tag, payload):
        return (struct.pack('>I', len(payload)) + tag + payload +
                struct.pack('>I', zlib.crc32(tag + payload) & 0xFFFFFFFF))

    png = (b'\x89PNG\r\n\x1a\n' +
           chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) +
           chunk(b'IDAT', zlib.compress(raw, 9)) +
           chunk(b'IEND', b''))
    open(os.path.join(shots, name.replace('.ppm', '.png')), 'wb').write(png)


def pixel(frame, x, y):
    width, _height, pixels = frame
    offset = (y * width + x) * 3
    return tuple(pixels[offset:offset + 3])


def distinct_colors(frame, x, y, w, h):
    seen = set()
    for row in range(y, y + h, 3):
        for column in range(x, x + w, 3):
            seen.add(pixel(frame, column, row))
    return len(seen)


def check(description, condition):
    global failures, checks
    checks += 1
    if condition:
        print(f"  PASS  {description}")
    else:
        print(f"  FAIL  {description}")
        failures += 1


for name in sorted(os.listdir(shots)):
    if name.endswith('.ppm'):
        to_png(name)

desktop = load('01-desktop.ppm')
check("the desktop rendered", desktop is not None)
if desktop:
    check("the wallpaper is drawn", distinct_colors(desktop, 300, 200, 400, 300) > 3)
    check("the taskbar is at the bottom", pixel(desktop, 500, 750)[2] > 20)
    check("icons are drawn down the left", distinct_colors(desktop, 20, 20, 120, 300) > 6)

launcher = load('02-launcher.ppm')
if launcher:
    check("the launcher menu opened",
          distinct_colors(launcher, 20, 300, 200, 400) > 4)

terminal = load('03-terminal.ppm')
if terminal:
    check("a window with a title bar appeared",
          distinct_colors(terminal, 60, 34, 700, 20) > 3)
    check("the terminal client area is dark",
          sum(pixel(terminal, 400, 300)) < 200)

settings = load('04-settings.ppm')
if settings:
    title = pixel(settings, 400, 70)
    check("the settings window opened with focus",
          title[2] > 100 and title[2] > title[0] + 40)
    check("the theme swatches are drawn",
          distinct_colors(settings, 100, 180, 500, 120) > 6)

theme_a = load('05-theme-a.ppm')
theme_b = load('05-theme-b.ppm')
if theme_a and theme_b:
    check("changing the theme repaints the wallpaper",
          pixel(theme_a, 900, 200) != pixel(theme_b, 900, 200))
    check("the settings choice reaches the desktop process",
          pixel(theme_b, 900, 600)[0] > pixel(theme_b, 900, 600)[2])

dragged = load('06-dragged.ppm')
if dragged:
    check("windows can be dragged",
          distinct_colors(dragged, 450, 300, 350, 250) > 6)

editor = load('07-editor.ppm')
if editor:
    check("the editor loaded a file from disk",
          distinct_colors(editor, 130, 140, 600, 80) > 3)

snake = load('08-snake.ppm')
if snake:
    check("snake drew its board",
          distinct_colors(snake, 160, 190, 400, 300) > 4)

processes = load('09-processes.ppm')
if processes:
    check("the session survived to the end",
          distinct_colors(processes, 60, 34, 700, 400) > 8)

print()
print(f"  {checks - failures} passed, {failures} failed")
sys.exit(1 if failures else 0)
PYEOF
result=$?

echo
echo "checking the kernel log..."
log_failures=0
for pattern in "KERNEL PANIC" "killed:" "overflowed"; do
    if grep -q "$pattern" "$SERIAL"; then
        echo "  FAIL  the log contains '$pattern'"
        grep -m3 "$pattern" "$SERIAL" | sed 's/^/        /'
        log_failures=$((log_failures + 1))
    else
        echo "  PASS  no '$pattern' in the kernel log"
    fi
done

echo
echo "screenshots in $SHOTS"
exit $(( result || log_failures ))
