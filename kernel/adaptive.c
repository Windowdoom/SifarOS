/*
 * Sifar Adaptive Core.
 *
 * This is intentionally a policy engine, not self-modifying kernel code. It
 * continuously observes bounded system signals and selects one of a handful of
 * auditable operating modes. Each mode changes only parameters exposed through
 * explicit kernel APIs, so every adaptation is reversible and testable.
 *
 * Inputs today:
 *   - runnable-thread pressure
 *   - process count
 *   - free physical memory
 *   - recent GUI interaction
 *   - Sentinel security escalation
 *
 * Outputs today:
 *   - scheduler quantum
 *   - background-service cadence
 *   - maximum browser/network response budget
 *   - temporary denial of new network transactions in defensive mode
 */
#include <kernel/adaptive.h>
#include <kernel/sched.h>
#include <kernel/proc.h>
#include <kernel/mm.h>
#include <kernel/security.h>
#include <kernel/kprintf.h>
#include <kernel/io.h>
#include <arch/x86.h>

#define SAMPLE_MS             250u
#define INTERACTIVE_WINDOW_MS 1500u
#define QUIET_AFTER_MS        10000u
#define THREAT_DECAY_MS       5000u
#define HYSTERESIS_SAMPLES    3u

static struct adaptive_snapshot state;
static enum adaptive_mode candidate_mode;
static uint32_t candidate_count;
static uint64_t last_interaction_ms;
static uint64_t last_threat_decay_ms;
static uint32_t threat_score;
static int initialized;
static int started;

struct thread_sample {
    uint32_t runnable;
    uint32_t sleeping;
    uint32_t user;
};

static void count_thread(const struct thread *thread, void *ctx)
{
    struct thread_sample *sample = (struct thread_sample *)ctx;

    if (!thread)
        return;
    if (thread->state == THREAD_READY || thread->state == THREAD_RUNNING)
        sample->runnable++;
    if (thread->state == THREAD_SLEEPING)
        sample->sleeping++;
    if (thread->user)
        sample->user++;
}

const char *adaptive_mode_name(enum adaptive_mode mode)
{
    switch (mode) {
    case ADAPTIVE_BALANCED:   return "balanced";
    case ADAPTIVE_RESPONSIVE: return "responsive";
    case ADAPTIVE_PRESSURE:   return "pressure";
    case ADAPTIVE_DEFENSIVE:  return "defensive";
    case ADAPTIVE_QUIET:      return "quiet";
    default:                  return "unknown";
    }
}

static void mode_policy(enum adaptive_mode mode, uint32_t *quantum,
                        uint32_t *background_ms, uint32_t *network_limit)
{
    switch (mode) {
    case ADAPTIVE_RESPONSIVE:
        *quantum = 2;          /* 20 ms: favour UI latency */
        *background_ms = 1000;
        *network_limit = 48u * KB;
        break;
    case ADAPTIVE_PRESSURE:
        *quantum = 8;          /* reduce scheduling overhead */
        *background_ms = 2000;
        *network_limit = 8u * KB;
        break;
    case ADAPTIVE_DEFENSIVE:
        *quantum = 2;          /* containment should preempt quickly */
        *background_ms = 250;
        *network_limit = 0;    /* no new outbound browser transactions */
        break;
    case ADAPTIVE_QUIET:
        *quantum = 10;         /* minimise background churn */
        *background_ms = 2500;
        *network_limit = 64u * KB;
        break;
    case ADAPTIVE_BALANCED:
    default:
        *quantum = 5;
        *background_ms = 500;
        *network_limit = 64u * KB;
        break;
    }
}

static void apply_mode(enum adaptive_mode mode, const char *reason,
                       const struct thread_sample *threads,
                       uint32_t free_percent, uint32_t threat)
{
    uint32_t quantum;
    uint32_t background_ms;
    uint32_t network_limit;
    enum adaptive_mode previous = (enum adaptive_mode)state.mode;

    mode_policy(mode, &quantum, &background_ms, &network_limit);
    state.mode = (uint32_t)mode;
    state.scheduler_quantum_ticks = quantum;
    state.background_interval_ms = background_ms;
    state.network_limit_bytes = network_limit;
    state.generation++;
    sched_set_quantum_ticks(quantum);

    if (mode != previous) {
        kprintf("adapt  : %s -> %s (q=%u, net=%u KiB) reason=%s run=%u free=%u%% threat=%u gen=%u\n",
                adaptive_mode_name(previous), adaptive_mode_name(mode),
                quantum, network_limit / KB, reason ? reason : "unknown",
                threads ? threads->runnable : 0, free_percent, threat,
                state.generation);
    }
}

static enum adaptive_mode choose_mode(const struct thread_sample *threads,
                                      uint32_t processes,
                                      uint32_t free_percent,
                                      uint32_t threat,
                                      uint64_t interaction_ms,
                                      uint64_t now,
                                      const char **reason)
{
    if (threat >= 6u) {
        *reason = "threat";
        return ADAPTIVE_DEFENSIVE;
    }

    if (free_percent <= 10u) {
        *reason = "low-memory";
        return ADAPTIVE_PRESSURE;
    }

    if (free_percent <= 20u && threads->runnable >= 6u) {
        *reason = "memory+runqueue";
        return ADAPTIVE_PRESSURE;
    }

    if (interaction_ms && now - interaction_ms <= INTERACTIVE_WINDOW_MS) {
        *reason = "interaction";
        return ADAPTIVE_RESPONSIVE;
    }

    if (threads->runnable >= 5u) {
        *reason = "runqueue";
        return ADAPTIVE_RESPONSIVE;
    }

    if (threads->user >= 3u) {
        *reason = "user-workload";
        return ADAPTIVE_RESPONSIVE;
    }

    if (threads->runnable <= 2u && processes <= 2u &&
        (!interaction_ms || now - interaction_ms >= QUIET_AFTER_MS)) {
        *reason = "idle";
        return ADAPTIVE_QUIET;
    }

    *reason = "steady";
    return ADAPTIVE_BALANCED;
}

/* Caller holds interrupts disabled so 64-bit timestamps cannot tear on i386. */
static void decay_threat_locked(uint64_t now)
{
    if (!last_threat_decay_ms)
        last_threat_decay_ms = now;

    while (threat_score && now - last_threat_decay_ms >= THREAT_DECAY_MS) {
        threat_score--;
        last_threat_decay_ms += THREAT_DECAY_MS;
    }
}

static void sample_once(void)
{
    struct thread_sample threads = {0, 0, 0};
    uint32_t total = pmm_total_frames();
    uint32_t free_frames = pmm_free_frames();
    uint32_t free_percent = total ?
        (uint32_t)(((uint64_t)free_frames * 100u) / total) : 0;
    uint32_t processes = (uint32_t)proc_count();
    uint64_t now = timer_ms();
    uint64_t interaction_ms;
    uint32_t threat;
    enum adaptive_mode desired;
    const char *reason = "steady";
    uint32_t flags;

    flags = irq_save();
    decay_threat_locked(now);
    interaction_ms = last_interaction_ms;
    threat = threat_score;
    sched_foreach(count_thread, &threads);
    irq_restore(flags);

    state.runnable_threads = threads.runnable;
    state.process_count = processes;
    state.free_memory_percent = free_percent;
    state.threat_score = threat;

    desired = choose_mode(&threads, processes, free_percent, threat,
                          interaction_ms, now, &reason);

    /* Defensive transitions happen immediately. Everything else must remain
     * the best policy for several consecutive samples to prevent oscillation. */
    if (desired == ADAPTIVE_DEFENSIVE) {
        candidate_mode = desired;
        candidate_count = HYSTERESIS_SAMPLES;
    } else if (desired == candidate_mode) {
        if (candidate_count < HYSTERESIS_SAMPLES)
            candidate_count++;
    } else {
        candidate_mode = desired;
        candidate_count = 1;
    }

    if (candidate_count >= HYSTERESIS_SAMPLES &&
        state.mode != (uint32_t)candidate_mode)
        apply_mode(candidate_mode, reason, &threads, free_percent, threat);
}

static void adaptive_thread(void *arg)
{
    (void)arg;

    for (;;) {
        sample_once();
        thread_sleep_ms(SAMPLE_MS);
    }
}

void adaptive_init(void)
{
    uint32_t quantum, background_ms, network_limit;

    mode_policy(ADAPTIVE_BALANCED, &quantum, &background_ms, &network_limit);
    state.generation = 1;
    state.mode = ADAPTIVE_BALANCED;
    state.runnable_threads = 0;
    state.process_count = 0;
    state.free_memory_percent = 100;
    state.threat_score = 0;
    state.scheduler_quantum_ticks = quantum;
    state.background_interval_ms = background_ms;
    state.network_limit_bytes = network_limit;
    candidate_mode = ADAPTIVE_BALANCED;
    candidate_count = HYSTERESIS_SAMPLES;
    last_interaction_ms = 0;
    last_threat_decay_ms = 0;
    threat_score = 0;
    started = 0;
    initialized = 1;
}

int adaptive_start(void)
{
    int tid;

    if (!initialized)
        return -1;
    if (started)
        return 0;
    tid = thread_create("adaptive", adaptive_thread, NULL);
    if (tid < 0)
        return -1;
    started = 1;
    return 0;
}

void adaptive_get_snapshot(struct adaptive_snapshot *out)
{
    uint32_t flags;

    if (!out)
        return;
    flags = irq_save();
    *out = state;
    irq_restore(flags);
}

void adaptive_note_security(uint32_t response_level)
{
    uint32_t add = 0;
    uint32_t flags;

    if (!initialized)
        return;
    if (response_level >= SECURITY_RESPONSE_KILL)
        add = 8;
    else if (response_level >= SECURITY_RESPONSE_ISOLATE)
        add = 5;
    else if (response_level >= SECURITY_RESPONSE_QUARANTINE)
        add = 3;
    else if (response_level >= SECURITY_RESPONSE_SUSPICIOUS)
        add = 1;

    if (!add)
        return;

    flags = irq_save();
    if (threat_score > 100u - add)
        threat_score = 100u;
    else
        threat_score += add;
    state.threat_score = threat_score;
    irq_restore(flags);
}

void adaptive_note_interaction(void)
{
    uint32_t flags;

    if (!initialized)
        return;
    flags = irq_save();
    last_interaction_ms = timer_ms();
    irq_restore(flags);
}

uint32_t adaptive_background_interval_ms(void)
{
    return state.background_interval_ms ? state.background_interval_ms : 500u;
}

size_t adaptive_network_limit(size_t requested)
{
    size_t limit = (size_t)state.network_limit_bytes;

    if (!limit)
        return 0;
    return requested < limit ? requested : limit;
}

int adaptive_network_allowed(void)
{
    return initialized && state.mode != ADAPTIVE_DEFENSIVE;
}
