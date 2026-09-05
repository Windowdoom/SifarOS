# How SifarOS fits together

## The boot sequence

1. **BIOS.** The firmware reads the first sector of the boot disk to physical
   `0x7C00` and jumps to it in 16-bit real mode with `DL` holding the drive
   number. That single sector read is the only favour the firmware does us.

2. **Stage 1** (`boot/stage1.asm`, exactly 512 bytes). Sets up a stack,
   configures COM1 so boot messages are visible headlessly, checks that the
   BIOS supports LBA disk reads, pulls the eight sectors of stage 2 to
   `0x7E00` and jumps into them.

3. **Stage 2** (`boot/stage2.asm`, 4 KiB). Walks the `int 15h/E820` memory map
   into `0x9000`, opens the A20 gate (BIOS first, port `0x92` as a fallback),
   reads 256 KiB of kernel to `0x00010000` in 32 KiB chunks, fills in the boot
   information block at `0x8000`, loads a flat GDT, sets `CR0.PE` and far jumps
   into 32-bit protected mode. It hands the kernel a pointer to the boot
   information block in `EBX`.

4. **Kernel entry** (`kernel/arch/x86/entry.S`). Points `ESP` at the kernel's
   own stack, zeroes `.bss` (a flat binary carries no zero pages), and calls
   `kmain()`.

5. **`kmain()`** (`kernel/main.c`) brings the system up in dependency order:
   console, descriptor tables, exception handlers, interrupt controller,
   physical memory, paging, heap, timer, keyboard, filesystem, syscalls,
   scheduler. Then it creates the shell thread and becomes the idle task.

## Memory map

| Range | Contents |
|---|---|
| `0x00000000 - 0x000004FF` | real mode IVT and BIOS data area |
| `0x00007C00 - 0x00007DFF` | stage 1 |
| `0x00007E00 - 0x00008DFF` | stage 2 |
| `0x00008000` | boot information block |
| `0x00009000` | E820 memory map entries |
| `0x00010000 - ...` | the kernel image |
| after the kernel | the physical frame bitmap |
| `0x000B8000` | VGA text framebuffer |
| `0x40000000` | user program image |
| `0x40800000` | top of the user stack (grows down, 4 pages) |
| `0xD0000000 - 0xD4000000` | kernel heap virtual window |

Everything below the end of the frame bitmap is permanently reserved, so the
kernel can never hand out a frame it is standing on.

## Subsystems

### Physical memory (`kernel/mm/pmm.c`)

One bit per 4 KiB frame. The bitmap starts fully reserved, then every region
the BIOS marked usable is released, then the kernel image and the bitmap itself
are taken back. Allocation is a scan for the first clear bit; the whole thing
runs with interrupts masked so it is safe from any context.

### Paging (`kernel/mm/paging.c`)

A two-level 4 KiB page table structure. All RAM is identity mapped, which keeps
physical pointers (page tables included) valid after paging comes on and means
the kernel needs no recursive mapping trick to edit its own tables. Mappings
above the identity region are handed out to the heap and to user programs;
`PTE_USER` is propagated to the directory entry so ring 3 can reach its pages
and nothing else.

### Kernel heap (`kernel/mm/kheap.c`)

A first-fit allocator over an implicit list of blocks with splitting and
coalescing on free. Growth is real: the heap asks the frame allocator for pages
and maps them at the end of its virtual window. `kheap_check()` walks the list
looking for corrupted headers or broken links, and the shell exposes it as
`heap`.

### Interrupts (`kernel/arch/x86/`)

`gen_isr.py` generates one stub per vector; each pushes a dummy error code
where the CPU does not supply one, pushes its vector number and falls into a
common trampoline that saves the register frame and calls `isr_dispatch()`.
The two PICs are remapped to vectors 32-47 so hardware interrupts stop
colliding with CPU exceptions.

Exceptions are handled in `fault.c` under one rule: a fault in ring 3 kills
that program, a fault in ring 0 is a kernel bug and panics. That is what lets
`run faulter` fail without taking the machine with it.

### Scheduling (`kernel/sched.c`, `kernel/arch/x86/switch.S`)

Round robin with a 50 ms quantum. Each thread owns a 16 KiB kernel stack from
the heap. `context_switch` pushes the callee-saved registers and flags, swaps
`ESP`, and pops the incoming thread's state; a new thread's stack is seeded so
the first switch lands in a trampoline that calls its entry point.

The switch deliberately does not happen inside the timer handler. The handler
only sets a flag, and `isr_dispatch()` performs the switch after acknowledging
the interrupt controller, so a thread that is entered for the first time never
inherits a pending unacknowledged interrupt.

Exit codes are recorded in a small ring buffer, so `thread_join()` can still
answer for a thread the idle task has already reaped.

### Filesystem (`kernel/fs/`)

`vfs.c` owns the tree, the names and all path handling: absolute and relative
paths, `.` and `..`, sorted directory listings, recursive delete, and rebuilding
a path from a node. `ramfs.c` stores contents in heap buffers that double in
size as they grow. Backends plug in through a `struct fs_ops`, which is where a
real disk filesystem would attach.

### User mode (`kernel/proc.c`, `kernel/syscall.c`, `user/`)

Programs are built as flat binaries linked at `0x40000000`, converted to object
files by `objcopy` and linked into the kernel image. Loading one means
allocating frames, mapping them with the user bit, copying the image in and
mapping a stack. `enter_usermode` forges the stack frame an interrupt would
have pushed and `iret`s into ring 3.

The only way back is `int 0x80`. Every pointer that crosses the boundary is
checked against the user address range and verified to be mapped before the
kernel dereferences it, so a hostile program cannot talk the kernel into
reading or writing kernel memory on its behalf. The TSS `esp0` field is updated
on every context switch so an interrupt taken in ring 3 lands on the right
kernel stack.

### Console (`kernel/dev/`)

Output fans out to VGA text mode and the serial line at once. Input is merged
from the PS/2 keyboard ring buffer and the UART, with terminal escape sequences
decoded into the same key codes the keyboard produces. That symmetry is what
makes the system scriptable: `tools/test.sh` drives the real shell over the
serial port exactly as a person would.

## Testing

`kernel/ktest.c` runs 84 assertions inside the booted kernel against live
hardware state. `tools/test.sh` boots the image under QEMU, feeds the shell a
script of commands, and checks 44 expectations across boot, the shell, the
filesystem, multitasking, ring 3 and the self-test summary. Both are wired into
`make test`, and a single failure fails the run.
