# SifarOS: future-computing product thesis

SifarOS should not try to predict the visual fashion of 2050. It should build
interfaces and kernel contracts that remain useful as screens, sensors and
accelerators change.

## Product promise

**The operating system adapts around the person, explains what it changed, and
never adapts away a security or privacy invariant.**

The differentiator is not a wallpaper, an AI chatbot, or a scheduler heuristic.
It is a transparent cross-layer policy substrate spanning security, scheduling,
networking, rendering and applications.

## Near-term principles we can implement now

1. **Calm computing**
   - Background adaptation should be mostly invisible.
   - The system should surface a concise reason only when a policy transition is
     material to the user.
   - Prefer fewer controls with good defaults over dashboards full of switches.

2. **Local-first intelligence**
   - Context and personalization data belong on the device by default.
   - Future ML/LLM runtimes should be system services with explicit capabilities,
     resource budgets and inspectable provenance.
   - Cloud inference is an optional capability, not the root of the OS.

3. **Adaptive, but auditable**
   - Every policy transition has a generation, reason and bounded outputs.
   - Hard security properties such as W^X, user/kernel isolation and capability
     checks never become policy suggestions.
   - Adaptation must be reversible and testable.

4. **Input-agnostic interaction**
   - Mouse/keyboard are only the first input providers.
   - GUI actions should be semantic (activate, select, back, invoke, scroll), so
     touch, voice, gaze, switch control, EMG or future inputs can map to the same
     intent layer without rewriting applications.

5. **Display-agnostic surfaces**
   - Applications request surfaces and semantic layout, not assumptions about a
     single desktop monitor.
   - Future targets can include high-DPI, touch, handheld, wearable and spatial
     displays while keeping the application model stable.

6. **Graceful heterogeneity**
   - CPU, GPU, NPU and future accelerators are resources selected by policy.
   - Applications ask for work, not a vendor-specific accelerator.
   - A future quantum or remote accelerator would enter through an asynchronous
     compute-service boundary, never through kernel-wide assumptions.

7. **Durability as a software feature**
   - Recovery, rollback, repair diagnostics and long-lived file formats matter as
     much as visual polish.
   - Updates must be verifiable and reversible.
   - Hardware capabilities should be discoverable so the same OS can degrade
     cleanly on older or repaired devices.

8. **Accessibility is an input architecture**
   - Large targets, keyboard traversal and semantic focus are baseline.
   - Voice, gaze, dwell, switch and alternative-pointer input should be first-class
     providers when hardware support arrives.

## Sifar Adaptive Core: what makes the concept defensible

Today the Adaptive Core observes runnable threads, process count, free memory,
recent interaction and Sentinel threat escalation. It can change scheduler
quantum, service cadence and browser/network budget, and can stop new browser
network transactions in defensive mode.

That is useful, but it is **not yet a learning system and not yet a unique
industry breakthrough**. Static thresholds and five modes are a prototype.

The defensible direction is an **explainable cross-layer adaptation protocol**:

- Inputs are typed signals with provenance and confidence.
- Policies produce bounded intents rather than arbitrary kernel writes.
- Each transition records `from`, `to`, `reason`, `evidence`, `outputs` and a
  monotonic generation.
- Applications can observe policy state but cannot weaken protected invariants.
- User preferences are constraints, not training data exported by default.
- Policy quality is measured against latency, energy, memory, network and
  security outcomes.
- A simulator/replay harness can feed historical traces into a new policy before
  that policy is allowed to control a live machine.

If SifarOS reaches that architecture, the valuable claim is not "the first OS
that adapts". Adaptive operating systems have existed for decades. The stronger
claim would be: **a small, inspectable OS in which adaptation is a first-class,
explainable, cross-layer protocol with non-negotiable security boundaries.**

## 2.0 overhaul acceptance criteria

The overhaul is not finished merely because screenshots look newer.

- Strict `make` passes with warnings as errors.
- Serial and GUI regression suites pass.
- The desktop and first-party apps share one visual system and spacing scale.
- Adaptive state is visible in System Monitor with the reason for the active
  mode and the concrete policy outputs.
- UI redraw cadence/effects respond safely to adaptive mode.
- Browser follows bounded HTTP redirects.
- HTTPS is never silently downgraded. TLS is only enabled through a vetted
  cryptographic implementation with certificate validation.
- The browser remains capability-confined.
- No overhaul commit replaces unrelated source files wholesale.

## Longer-horizon milestones

### 2.x
- modern UI typography/rendering
- semantic input actions and keyboard focus
- adaptive observability and transition log
- DHCP and IPv6 groundwork
- vetted TLS 1.3 + root trust store
- signed updates and rollback

### 3.x
- 64-bit kernel and UEFI
- hardware-backed measured boot
- SMP and per-core scheduling
- hardware-accelerated compositor
- local inference service and accelerator abstraction
- declarative application permissions

### Future hardware track
- gaze/dwell input provider
- voice and local speech provider
- EMG/switch provider
- spatial surface backend
- NPU/GPU compute broker
- optional remote/quantum compute broker with explicit data-flow policy

The rule is simple: future-facing capability enters through a narrow service
contract. It does not earn the right to bypass the OS security model.
