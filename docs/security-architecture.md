# SifarOS Security Architecture

## Security objective

SifarOS does not claim to be mathematically unhackable. The goal is a layered security architecture in which a compromise of one application does not automatically become a compromise of another application, the kernel, the filesystem, or the boot chain.

The security model is based on five properties:

1. **Least privilege**: code receives only the authority it needs.
2. **Isolation**: user processes cannot directly access kernel memory or another process's address space.
3. **W^X**: writable memory is not executable; executable program segments are not writable.
4. **Fail closed**: malformed input, invalid pointers, permission failures, and integrity failures are rejected.
5. **Detect, contain, recover**: prevention is backed by telemetry, quarantine, termination, and trusted recovery paths.

## Current v1 enforcement

The hardening branch strengthens the ring-3 boundary:

- user pointer validation is performed against the calling process address space;
- kernel reads and kernel writes have separate validation paths;
- write-oriented syscalls require writable user pages;
- user mappings are restricted to the user virtual-address window;
- zero-length and arithmetic-overflow cases are handled explicitly;
- `sbrk` rejects address-space wraparound and releases pages when shrinking;
- ELF headers and program-header tables are bounds checked;
- ELF `filesz <= memsz` is enforced;
- ELF load segments must remain inside user space;
- malformed segment alignment is rejected;
- writable + executable load segments are rejected;
- the ELF entry point must fall inside an executable load segment;
- syscall output-array size multiplication is checked before validation;
- Sentinel maintains a bounded kernel-owned event ring;
- process start/exit and unknown-syscall events can be recorded without retaining user pointers;
- kernel self-tests exercise Sentinel event recording and ring-buffer wraparound.

## Security roadmap

### Phase 1: memory and syscall boundary

- Make every syscall pointer use explicit read/write access validation.
- Validate multiplication and length arithmetic before allocating or copying.
- Copy untrusted syscall data into bounded kernel buffers before filesystem or device operations.
- Add guard pages around user stacks and selected kernel stacks.
- Add regression tests for kernel-pointer, unmapped, read-only, cross-page, and overflowed ranges.

### Phase 2: capability security

Replace broad PID-based authority with kernel-issued capabilities for sensitive resources. A capability is unforgeable, scoped, revocable, and owned by a process. Examples include file handles, IPC endpoints, windows, devices, and future network sockets.

### Phase 3: Sentinel security monitor

Sentinel is the native SifarOS defensive security service. It is not antivirus based on a giant signature database. It observes security-relevant events and applies policy.

Current foundation:

- bounded kernel-owned event ring;
- monotonic event sequence numbers;
- process lifecycle telemetry;
- unknown-syscall telemetry;
- explicit response levels;
- typed capability-denial reasons independent of syscall numbers;
- quarantine revocation of network, control, and filesystem mutation authority;
- regression coverage for ring-buffer behavior.

Next event classes:

- executable validation and integrity changes;
- privilege transitions;
- suspicious memory mappings;
- repeated syscall failures;
- resource exhaustion attempts;
- unauthorized filesystem changes;
- persistence attempts;
- capability violations.

Response levels:

`NORMAL -> OBSERVE -> SUSPICIOUS -> QUARANTINE -> ISOLATE -> TERMINATE`

Sentinel must itself be minimally privileged. A compromised user process must not be able to disable, rewrite, or impersonate the security monitor.

### Phase 4: integrity and recovery

- signed boot artifacts;
- measured boot with TPM 2.0 on supported hardware;
- signed system updates;
- anti-rollback metadata;
- known-good recovery image;
- tamper-evident security event log;
- optional full-disk encryption with hardware-backed key release.

### Phase 5: modern 64-bit security platform

The current 32-bit BIOS target is a development platform, not the final security ceiling. The serious target is x86-64 with UEFI Secure Boot, NX, SMEP, SMAP, kernel/user ASLR, stronger control-flow defenses, hardened allocators, and a smaller privileged TCB.

### Phase 6: network security and VPN

SifarOS should use established, audited cryptographic protocols rather than inventing a VPN protocol. The target architecture is:

`Application policy -> capability check -> firewall -> VPN tunnel -> network device`

A WireGuard-compatible implementation is the preferred direction once networking exists.

## Threat model

The design targets malicious user applications, malformed executables, compromised application data, accidental memory corruption, privilege-escalation attempts, unauthorized persistence, and hostile network input once networking is available.

No software-only architecture can guarantee protection against every physical or firmware-level attacker, every undiscovered kernel vulnerability, or a fully compromised trusted boot component. Those cases require hardware-backed trust and recovery mechanisms.
