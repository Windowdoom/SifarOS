# Running and using SifarOS

## 1. Get it

```sh
git clone https://github.com/Windowdoom/SifarOS.git
cd SifarOS
git checkout claude/os-from-scratch-wfztk9
```

## 2. Install what the build needs

**Ubuntu or Debian (also WSL on Windows):**

```sh
sudo apt-get update
sudo apt-get install build-essential gcc-multilib nasm python3 qemu-system-x86
```

**Fedora:**

```sh
sudo dnf install gcc glibc-devel.i686 nasm python3 qemu-system-x86 make
```

**macOS**, Intel or Apple Silicon. The compiler Apple ships cannot produce
32-bit x86 code at all, so a cross compiler is required. Homebrew has one:

```sh
brew install qemu nasm i686-elf-gcc i686-elf-binutils
brew install coreutils
```

The build finds `i686-elf-gcc` on its own, so plain `make` works after that.
`coreutils` is only needed for `make test`, which wants a `timeout` command.

If you see a wall of errors like `invalid instruction, did you mean: ldr, pld?`
then the build is using Apple's compiler and it is trying to assemble x86 as
ARM. Install the cross compiler above and run `make clean` before `make`.

**Windows:** install WSL2 with Ubuntu, then follow the Ubuntu instructions
inside it. Running a graphical QEMU window needs WSLg, which ships with
Windows 11. On Windows 10, use `make run-serial` instead and drive the kernel
console from the terminal.

## 3. Build and boot

```sh
make
make run
```

The first takes about ten seconds. Note for macOS: do not paste a command
with a trailing `# comment` into zsh. Unlike bash, an interactive zsh does
not treat `#` as the start of a comment and will pass it to the command.

A window opens and the system boots to its desktop in well under a second.

Two things about the QEMU window:

- **Click inside it** to hand it the mouse. `Ctrl-Alt-G` gives the mouse back
  to your host.
- The terminal you launched from is the **kernel console**, live the whole
  time. It is a second, separate shell that talks to the kernel directly.

To quit: close the window, or press `Ctrl-A` then `X` in the terminal.

If the machine has KVM (`ls /dev/kvm`), the run script uses it automatically
and everything feels immediate. Without it the compositor still works, just
more deliberately.

## 4. Using the desktop

| Action | How |
|---|---|
| Start an application | double click its icon, or use the SifarOS button in the bottom left |
| Move a window | drag its title bar |
| Resize a window | drag the bottom right corner |
| Minimise or close | the two buttons at the top right of the window |
| Switch windows | click its button in the taskbar |
| Bring a window forward | click anywhere in it |

The clock and free memory in the bottom right are live.

## 5. The applications

**Terminal** is the one to open first. `help` lists everything. A tour:

```
ls /apps                    what is installed
cat /home/readme.txt        read a file off the disk
write /home/notes.txt hello there
cat /home/notes.txt
mkdir /home/work
cd /home/work
pwd
run clock                   start another application
ps                          what is running
mem                         memory, disk and CPU
dmesg                       the kernel boot log
uptime
date
```

Arrow keys walk the command history, `Home` and `End` move along the line, and
the mouse wheel scrolls the output back.

**Text Editor** opens a file passed to it: `run editor /home/notes.txt`. Type,
then press Save. The change is on the disk, so it is still there after a
reboot. Try it: save something, close the window, quit QEMU, `make run` again,
and open the same file.

**Files** browses the disk. Double click a folder to enter it, a file to open
it in the editor, `Up` to go back. It can also create folders and delete
things.

**System Monitor** shows live memory and disk use, a history graph and the
process list. Select a process and press End process to kill it.

**Settings** changes the desktop theme. Pick one and the wallpaper changes
within a second: settings writes the choice to `/etc/desktop.conf` and the
desktop, a separate process, notices the file changed.

**Calculator, Clock, Paint, Snake, About** are what they sound like. Snake
takes the arrow keys or WASD, space to pause, enter to restart.

## 6. The kernel console

The terminal you started QEMU from is a shell into the kernel itself, useful
when you want to see what is happening underneath the desktop:

```
selftest     132 checks against the running system
windows      the window server's window list and cursor position
procs        processes, their parents and their memory
ps           kernel threads
mem          physical and virtual memory
df           filesystem usage
bench        time the graphics paths
exec /apps/hello     run a program with its output here
run faulter          watch a program get killed for touching kernel memory
halt         shut the machine down
```

## 7. Proving the interesting parts to yourself

**Memory protection.** In the kernel console, `run faulter`. The program
deliberately reads kernel memory. The kernel kills it, prints one line, and
everything else keeps running.

**Persistence.** Write a file, `halt`, then `make run` again and read it back.
The disk image on your host really changed.

**Preemption.** In the kernel console, `spawn 3`. Three kernel threads
interleave their output while the shell stays responsive.

**Isolation between applications.** Open several windows, then use System
Monitor to end one. The others do not notice.

## 8. Running the test suites

```sh
make test       # 45 checks: boot, filesystem, processes, fault handling,
                # the in-kernel suite, then a reboot to prove writes persisted
make test-gui   # 15 checks: drives the desktop with QEMU's mouse and keyboard
                # and inspects the frames it produced
make shot       # save a screenshot to build/screen.png
```

`make test-gui` rebuilds the disk image first, so it starts from a known state.
That wipes anything you saved. Set `FRESH=0` to keep it.

On Apple Silicon everything runs under emulation, with no hardware
virtualisation for a 32-bit x86 guest, so the desktop will feel slower than
the timings quoted here. It still works.

## 9. When something goes wrong

**The build fails on `-m32`, or the assembler talks about ARM instructions.**
The compiler cannot target 32-bit x86. On Debian or Ubuntu install
`gcc-multilib`, on Fedora `glibc-devel.i686`, on macOS `i686-elf-gcc` and
`i686-elf-binutils` from Homebrew. `make` prints this advice itself and stops
rather than burying you in assembler errors.

**`make test` says `timeout: command not found`.** That is macOS. Install
Homebrew coreutils, which provides `gtimeout`, and the scripts will find it.

**No window appears.** There is no display. Use `make run-serial`, or on WSL
install WSLg.

**The mouse pointer does not move.** Click inside the QEMU window first.

**The desktop never appears but the boot log does.** The video BIOS refused a
32-bit VESA mode. The log says `video : no VESA framebuffer`. Force the standard
adapter with `qemu-system-i386 -vga std -drive format=raw,file=build/sifaros.img -m 512`.

**You want a clean disk.** `make clean && make` rebuilds the filesystem image
from scratch.

## 10. On real hardware

The image is a raw disk with a real master boot record:

```sh
sudo dd if=build/sifaros.img of=/dev/sdX bs=1M conv=fsync   # this erases /dev/sdX
```

Check the device name twice. The machine needs legacy BIOS or CSM boot, a
VESA 2.0 video BIOS, a PS/2 or emulated PS/2 keyboard and mouse, and an IDE or
SATA disk the BIOS can read in legacy mode. It needs 64 MiB of RAM; it will use
more if it is there.
