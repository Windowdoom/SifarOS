# How SifarOS fits together

## The boot sequence

1. **BIOS.** The firmware reads the first sector of the boot disk to physical
   `0x7C00` and jumps to it in 16-bit real mode. That single sector read is the
   only favour the firmware does us.

2. **Stage 1** (`boot/stage1.asm`, exactly 512 bytes). Sets up a stack,
   configures COM1 so boot messages are visible headlessly, checks that the
   BIOS supports LBA reads, pulls stage 2 off the disk and jumps into it.

3. **Stage 2** (`boot/stage2.asm`, 4 KiB). Everything that needs the BIOS has
   to happen here, because after the switch to protected mode the BIOS is gone:
   the `int 15h/E820` memory map, the 8x16 font copied out of the video ROM
   (`int 10h/1130h`), the A20 gate, reading 512 KiB of kernel to `0x00010000`,
   and choosing a VESA mode. It walks the VBE mode list for a 32-bit linear
   framebuffer at 1024x768, then 1280x800, 800x600 or 640x480, sets it, records
   the framebuffer address and geometry, loads a flat GDT and enters protected
   mode with `EBX` pointing at the boot information block.

4. **Kernel entry** (`kernel/arch/x86/entry.S`) points `ESP` at the kernel
   stack, zeroes `.bss` and calls `kmain()`.

5. **`kmain()`** brings the system up in dependency order: console, descriptor
   tables, exception handlers, interrupt controller, FPU, physical memory,
   paging, heap, graphics, timer, input, processes, disk, filesystem, syscalls,
   scheduler. Then it starts the window server, spawns `/apps/desktop` and
   becomes the idle task.

## Address space

| Range | Contents |
|---|---|
| `0x00000000 - 0x3FFFFFFF` | kernel: all physical RAM, identity mapped |
| `0x40000000 - 0x407FFFFF` | user program image and heap |
| `0x40800000` | top of the user stack (grows down) |
| `0x60000000 - 0x6FFFFFFF` | window pixel buffers mapped into the owner |
| `0xD0000000 - 0xD3FFFFFF` | kernel heap window |
| `0xE0000000 - ...` | framebuffer and other device mappings |

Every process has its own page directory. The kernel half is described by page
tables allocated once during boot and copied into each new directory as
directory entries, so a mapping the kernel makes later is visible in every
address space without any bookkeeping. That is what lets an interrupt handler
run correctly no matter which process happens to be current.

## Subsystems

### Physical memory (`kernel/mm/pmm.c`)

One bit per 4 KiB frame, seeded from the BIOS memory map: everything starts
reserved, usable regions are released, then the kernel image and the bitmap
itself are taken back. There is also a contiguous allocator, which window
buffers use so the kernel can treat one as a flat array through the identity
map while the owning process sees it through its own mapping.

### Paging (`kernel/mm/paging.c`)

Two-level 4 KiB paging. `vmm_map_in`, `vmm_alloc_range` and friends take the
address space to act on, so the kernel can build a process's memory before
that process ever runs - segments are written through the identity map at
their physical addresses.

### Kernel heap (`kernel/mm/kheap.c`)

First fit over an implicit block list with splitting and coalescing. It grows
by asking the frame allocator for pages and mapping them at the end of its
virtual window, so heap growth is real demand paging. `kheap_check()` walks the
list looking for corruption; the shell exposes it as `heap`.

### Scheduling (`kernel/sched.c`, `arch/x86/switch.S`)

Round robin with a 50 ms quantum, one 32 KiB kernel stack per thread with a
guard word the scheduler checks on every switch. A switch saves the callee
registers and flags, the FPU/SSE register file, and installs the incoming
thread's address space before its first instruction runs.

The switch deliberately does not happen inside the timer handler: the handler
only raises a flag and `isr_dispatch()` performs the switch after acknowledging
the interrupt controller, so a thread entered for the first time never inherits
a pending unacknowledged interrupt.

### Processes (`kernel/proc.c`, `kernel/elf.c`)

A process owns an address space, a heap and a main thread. Loading one means
creating the space, mapping and copying the PT_LOAD segments, mapping a stack,
building the `argc`/`argv` block the way `crt0` expects it, and starting a
thread that drops to ring 3 with a forged `iret` frame.

Tearing one down cannot happen inside the dying thread, which is still standing
on the address space and whose CR3 still points at the page directory being
freed, so the idle task does it once the thread has switched away for the last
time.

### Faults (`kernel/arch/x86/fault.c`)

One rule: a fault in ring 3 kills that program, a fault in ring 0 is a kernel
bug and stops the machine. `run faulter` in the terminal demonstrates the first
half.

### Storage (`kernel/dev/ata.c`, `kernel/fs/sfs.c`)

Polled ATA PIO. SifarFS on top: block 0 is the superblock, then a free block
bitmap, then a flat inode table, then data. Inodes have twelve direct blocks
and one indirect block. Directories are arrays of 64-byte entries. The
directory tree is read into VFS nodes at mount time and kept in step as files
are created and removed; contents stay on the disk and writes go straight
through.

Block buffers come from a small heap pool rather than the stack. A 4 KiB buffer
on a kernel stack that also has to absorb interrupts is how you get corruption
that shows up somewhere else entirely, hours later.

### Filesystem layer (`kernel/fs/vfs.c`)

The VFS owns the tree, the names and all path handling: absolute and relative
paths, `.` and `..`, sorted listings, recursive delete, rebuilding a path from
a node. Backends plug in through a `struct fs_ops`; new nodes inherit the
filesystem of the directory that holds them, which is what makes a disk mount
and an in-memory directory able to coexist in one tree.

### Graphics (`kernel/gfx/gfx.c`)

Everything is drawn into 32-bit surfaces with a clip rectangle. The screen is
one such surface: a back buffer in RAM that gets copied to the card in pieces.
Pushing a whole 1024x768 frame costs around 60 ms under emulation, so the
compositor tracks damage and sends only what changed - a repainted text line is
about a millisecond.

### Window server (`kernel/gui/wm.c`)

Applications own the pixels inside their windows; the server allocates the
buffer, maps it into the application's address space and never draws in it.
The server owns everything else: stacking with bottom and top bands so the
wallpaper stays behind and the taskbar in front, focus, decorations, dragging,
resizing, the cursor, and routing input to the window under it.

Events go to a per-window queue that the owning process drains with a syscall.
Resizing reallocates the buffer at the same user address, so an application's
pointer stays valid and it just gets told the new size.

### System call interface (`kernel/syscall.c`, `include/sys/`)

`int 0x80`, call number in EAX, three arguments in EBX, ECX and EDX. Around
forty calls: process control, console, files and directories, memory, the
window system and system information. Every pointer that crosses the boundary
is checked against the calling process's own address space before the kernel
dereferences it.

### User space (`user/lib`, `user/apps`)

`libsifar` is the whole standard library: syscall wrappers, a first-fit heap
over `sbrk`, strings, formatting. The toolkit above it is immediate mode - an
application redraws its window when something changes and widgets report what
happened as they are drawn - which suits programs that are mostly a few
controls over a drawing area.

The desktop is not special. It is a process that opens a full screen window at
the bottom of the stack for the wallpaper, a window pinned on top for the
taskbar, and asks the server for the window list to draw the buttons. Settings
writes preferences to `/etc/desktop.conf` and the desktop notices; both sides
already agree on the filesystem, so that is the message bus.

## Testing

`kernel/ktest.c` runs 132 assertions inside the booted kernel against live
hardware state: strings, formatting, 64-bit division, the frame allocator,
paging and address spaces, the heap, the filesystem, the scheduler, interrupt
delivery, floating point across a context switch, the drawing primitives, the
ELF loader, process creation and exit status, the disk, persistence and the
window server.

`tools/test.sh` boots the image, drives the serial shell, checks 44
expectations and then reboots to confirm the disk kept what was written.
`tools/test-gui.sh` boots the desktop, drives it with QEMU's mouse and
keyboard, and checks the resulting frames.
