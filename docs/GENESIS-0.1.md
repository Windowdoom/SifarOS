# SifarOS Genesis, Iteration 1

This branch is the first integrated SifarOS Genesis build.

Branch: `sifar/genesis-v0.1`

Reference baseline: Claude's known-good OS commit
`1bf24253f9efff449d0449763fab4e1a6f9a9fc0`.

## What Genesis is

Genesis is the 32-bit x86 proving ground for SifarOS. It is a real bootable
operating system built from scratch: two-stage BIOS boot, protected-mode
kernel, paging, preemptive scheduling, ring 3 processes, SifarFS, a window
system, and native user applications.

It is not the final SifarOS architecture. The long-term Core is expected to
move to x86-64 and UEFI once Genesis has proved the kernel, isolation, security
and recovery concepts.

## Integration rule

Claude's working desktop, filesystem, applications, boot path, macOS build
support and test harness are the compatibility baseline. Security changes are
applied as small patches and must keep that baseline green.

The earlier experimental integration is preserved at
`sifar/genesis-v0.1-pre-rebuild`. It is not the release candidate because
several large source files were found to have been unintentionally truncated.

## Security in this iteration

Implemented or hardened here:

- private address spaces for user processes and ring 3 isolation
- page-aware user pointer validation, including write permission for kernel
  outputs
- checked syscall array-size arithmetic
- low physical-memory allocation restricted to the part Genesis actually
  identity maps
- strict ELF32 header and segment bounds validation
- rejection of writable-plus-executable ELF segments
- rejection of load-segment page overlap that could merge permissions
- executable entry-point validation
- bounded user executable size and safer process launch/stack construction
- user heap shrink releases whole pages
- Sentinel v1 kernel event-ring infrastructure
- warnings-as-errors build plus automated serial and graphical QEMU tests

## Security claims we do not make

Genesis Iteration 1 does not claim to be unhackable. In particular it does not
yet have:

- hardware NX enforcement on this 32-bit paging implementation
- ASLR or KASLR
- UEFI Secure Boot or TPM measured boot
- a capability permission model
- cryptographically verified updates or rollback protection
- encrypted filesystem or full-disk encryption
- a network stack, firewall or WireGuard VPN
- active Sentinel quarantine, isolation or recovery policy

Some global ring 3 operations, including process kill and power control, still
need to move behind capabilities. They remain compatibility debt for the next
security iteration.

## Definition of green

A candidate is green only when GitHub CI completes all three stages:

1. `make clean && make` with warnings treated as errors
2. `make test` for boot, kernel, filesystem, processes, faults and persistence
3. `make test-gui` for the desktop, launcher, terminal, settings, themes,
   window movement, editor, Snake and session survival

The graphical test also rejects kernel panic, unexpected process-kill and stack
overflow markers in the serial log.

## Local launch

After the CI candidate is green, a developer should be able to build the same
branch with the 32-bit x86 cross-toolchain and launch it with `make run` in
QEMU. See `docs/USING.md` for the inherited platform-specific toolchain notes.
