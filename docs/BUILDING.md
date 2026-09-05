# Building SifarOS

## Toolchain

SifarOS builds with an ordinary Linux toolchain; no cross compiler is needed
because the kernel is freestanding and linked by hand.

```sh
# Debian or Ubuntu
sudo apt-get install build-essential gcc-multilib nasm python3 qemu-system-x86
```

| Tool | Why |
|---|---|
| `gcc` with `-m32` | compiles the kernel, the library and the applications |
| `ld`, `objcopy` | links the flat kernel and the ELF applications |
| `nasm` | assembles the two bootloader stages |
| `python3` | builds the filesystem image (`tools/mkfs.py`) |
| `make` | drives everything |
| `qemu-system-i386` | runs it |

## Targets

```sh
make              # build/sifaros.img
make run          # boot it
make run-serial   # boot headless with the kernel console on this terminal
make test         # serial test suite, including a reboot to check persistence
make test-gui     # drive the desktop with mouse and keyboard, check the frames
make shot         # boot and save build/screen.png
make debug        # boot stopped for gdb on localhost:1234
make apps         # just the applications
make clean
```

## What the build produces

```
build/
  stage1.bin        512 byte boot sector
  stage2.bin        4 KiB loader
  kernel.elf        linked kernel with symbols, for debugging
  kernel.bin        flat kernel image written to the disk
  user/lib/*.o      libsifar and the toolkit
  user/*.elf        the applications
  fs.img            a SifarFS filesystem holding /apps and the home directory
  sifaros.img       64 MiB raw disk image
```

Disk layout:

| LBA | Contents |
|---|---|
| 0 | stage 1 (ends in `0x55AA`) |
| 1-8 | stage 2 |
| 9-1032 | the kernel image, zero padded |
| 2048- | the SifarFS filesystem |

The kernel must stay under 512 KiB; the build fails loudly if it does not.

## Adding an application

Drop a C file in `user/apps/`. The build picks it up, links it against
`libsifar` and the toolkit, and `tools/mkfs.py` puts it in `/apps` where the
desktop and the terminal will find it.

```c
#include "ui.h"

int main(int argc, char **argv)
{
    ui_window *window = ui_window_open("Example", 320, 200, GUI_NORMAL);
    int clicks = 0;

    while (ui_begin(window)) {
        char label[32];

        ui_clear(window, UI_BG);
        snprintf(label, sizeof(label), "clicked %d times", clicks);
        ui_text(window, 20, 20, label, UI_TEXT);
        if (ui_button(window, 20, 60, 120, 30, "Press me"))
            clicks++;

        ui_end(window);
        ui_frame_wait();
    }

    ui_window_close(window);
    return 0;
}
```

`ui_begin` returns zero when the user closes the window. Widgets report what
happened as they are drawn, so there is no callback plumbing.

## Debugging

```sh
make debug            # in one terminal
gdb build/kernel.elf  # in another
(gdb) target remote localhost:1234
(gdb) break kmain
(gdb) continue
```

`kernel.elf` keeps full debug information even though the image on disk is a
flat binary. For the bootloader, `set architecture i8086` and
`break *0x7c00` first.

The kernel keeps a debug console on the serial line for the whole session,
even after the desktop takes over the screen:

```sh
make run-serial
sifar:/$ selftest    # 132 in-kernel checks
sifar:/$ windows     # window server state and cursor position
sifar:/$ procs       # processes and their memory
sifar:/$ bench       # time the graphics paths
sifar:/$ dmesg       # (in the graphical terminal) the boot log
```

## Running on real hardware

The image is a raw disk with a valid master boot record, so it boots from a USB
stick on a machine with legacy BIOS support:

```sh
sudo dd if=build/sifaros.img of=/dev/sdX bs=1M conv=fsync   # destroys /dev/sdX
```

Pick the device carefully. The machine needs a BIOS or CSM, a VESA 2.0 video
BIOS (any card from the last twenty years), a PS/2 or emulated PS/2 keyboard
and mouse, and an IDE/SATA disk the BIOS can read in legacy mode.
