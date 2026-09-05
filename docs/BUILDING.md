# Building SifarOS

## Toolchain

SifarOS builds with an ordinary Linux toolchain; no cross compiler is needed
because the kernel is freestanding and linked by hand.

```sh
# Debian or Ubuntu
sudo apt-get install build-essential gcc-multilib nasm qemu-system-x86
```

| Tool | Why |
|---|---|
| `gcc` (with `-m32` support) | compiles the kernel and the user programs |
| `ld`, `objcopy` | link the flat binaries and wrap user images as objects |
| `nasm` | assembles the two bootloader stages |
| `make` | drives everything |
| `qemu-system-i386` | runs it |

## Targets

```sh
make              # build/sifaros.img
make run          # boot, graphical window when a display is available
make run-serial   # boot headless, console on the terminal
make test         # boot under QEMU and run the full test suite
make debug        # boot stopped for gdb on localhost:1234
make clean
```

## What the build produces

```
build/
  stage1.bin        512 byte boot sector
  stage2.bin        4 KiB loader
  kernel.elf        linked kernel with symbols (used for debugging)
  kernel.bin        flat kernel image written to the disk
  user/*.bin        flat ring 3 programs
  user/*_blob.o     those programs wrapped as linkable objects
  sifaros.img       2 MiB raw disk image
```

Disk layout of `sifaros.img`:

| LBA | Contents |
|---|---|
| 0 | stage 1 (boot sector, ends in `0x55AA`) |
| 1-8 | stage 2 |
| 9-520 | the kernel image, zero padded |

The kernel must stay under 256 KiB; the build fails loudly if it does not.

## Debugging

```sh
make debug            # in one terminal
gdb build/kernel.elf  # in another
(gdb) target remote localhost:1234
(gdb) break kmain
(gdb) continue
```

`kernel.elf` keeps full debug info even though the image is a flat binary, so
source-level debugging works from the first instruction of `kmain`.

For the bootloader, set the architecture to 16-bit first:

```
(gdb) set architecture i8086
(gdb) break *0x7c00
```

## Running on real hardware

The image is a raw disk with a valid master boot record, so it boots from a USB
stick on a machine with legacy BIOS support:

```sh
sudo dd if=build/sifaros.img of=/dev/sdX bs=1M conv=fsync   # destroys /dev/sdX
```

Pick the device carefully. On UEFI-only machines, enable CSM/legacy boot.
