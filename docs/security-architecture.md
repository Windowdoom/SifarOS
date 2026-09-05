# SifarOS Genesis Security Architecture

Security in Genesis is defense in depth. No single layer is treated as proof
that the system is safe, and this document distinguishes implemented controls
from future architecture.

## Threat model

Genesis is being hardened against four broad classes of failure:

1. a malicious or buggy ring 3 application
2. malformed executable or syscall input
3. accidental kernel exposure caused by memory or arithmetic bugs
4. future hostile persistence, network and supply-chain threats

Iteration 1 primarily addresses the first three. The fourth requires the
x86-64, UEFI, integrity, update and network work described below.

## Current trust boundaries

### Ring 3 processes

Each user process receives its own page directory. User pointers presented to
the kernel are validated against that address space. Kernel output operations
require PTE_USER and PTE_WRITE on every page they touch.

The kernel itself is never a valid source of user memory for a syscall.

### ELF execution

ELF32 images are untrusted input. The loader validates the file header,
program-header table, segment arithmetic, address window, file bounds and
alignment. Writable-plus-executable segments are rejected, page-overlapping
load segments are rejected, and the program entry point must fall inside an
executable PT_LOAD segment.

This is not hardware NX. Genesis' current 32-bit page-table format does not
supply a no-execute bit, so data pages cannot yet be made non-executable by the
MMU. True execute permission becomes a hardware boundary in the x86-64 port.

### Physical memory

Genesis directly dereferences physical frame addresses through its low-memory
identity mapping. The physical allocator therefore manages only RAM below the
1 GiB identity-mapped boundary. Supporting high physical memory requires an
explicit high-memory/direct-map design rather than handing unreachable frames
to the kernel.

### System calls

Syscall inputs are read-validated. Output structures, file reads, console
reads, directory listings, process listings, logs, fonts and similar kernel
writes are write-validated. Array byte lengths are checked before
multiplication where counts originate in ring 3.

The syscall ABI is still authority-heavy. Process kill, reboot and shutdown
are not yet capability-gated. That is known debt, not a completed security
claim.

## Sentinel v1

Sentinel currently provides a bounded kernel-owned security event ring. Events
contain scalar metadata copied by the kernel and no userspace pointers. The
ring is interrupt-safe and bounded to prevent logging itself from becoming a
resource-exhaustion path.

Sentinel v1 is observation infrastructure only. It does not yet claim active
malware detection, quarantine, process isolation, rollback or forensic
persistence.

Future Sentinel stages should consume the capability system rather than become
a permanently omnipotent daemon.

## Recovery and integrity roadmap

The next security layers are:

1. capability-based authority for process, filesystem, device, window and
   eventual network operations
2. structured Sentinel policy and response states
3. tamper-evident persistent security events
4. snapshots and known-good recovery
5. x86-64 paging with NX plus ASLR/KASLR foundations
6. UEFI Secure Boot, measured boot and TPM-backed key/recovery design
7. signed updates with rollback protection
8. encrypted storage
9. network isolation and WireGuard-based private networking

Established cryptography and protocols should be used rather than inventing
new primitives.

## Verification rule

A control is not described as complete because code exists. The candidate must
build with warnings as errors and pass the serial/kernel and graphical QEMU
integration suites. Security-specific regression tests should expand alongside
each new boundary.
