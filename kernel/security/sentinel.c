/*
 * Sentinel security monitor, v1.
 *
 * The first iteration is observation infrastructure, not an EDR claim. It
 * stores a bounded sequence of kernel-owned security events. Policy,
 * capability revocation, isolation and recovery build on this later.
 */
#include <kernel/security.h>
#include <kernel/string.h>
#include <kernel/io.h>
#include <arch/x86.h>

static struct security_event events[SECURITY_EVENT_LOG_CAPACITY];
static uint32_t event_head;
static uint32_t event_count;
static uint64_t next_sequence;
static uint8_t initialized;

void security_init(void)
{
    uint32_t flags = irq_save();

    memset(events, 0, sizeof(events));
    event_head = 0;
    event_count = 0;
    next_sequence = 1;
    initialized = 1;

    irq_restore(flags);
}

void security_event_record(enum security_event_type type, uint32_t pid,
                           uint32_t code, enum security_response response)
{
    struct security_event *event;
    uint32_t flags = irq_save();

    if (!initialized) {
        memset(events, 0, sizeof(events));
        event_head = 0;
        event_count = 0;
        next_sequence = 1;
        initialized = 1;
    }

    event = &events[event_head];
    event->sequence = next_sequence++;
    event->timestamp_ms = timer_ms();
    event->type = (uint32_t)type;
    event->pid = pid;
    event->code = code;
    event->response = (uint32_t)response;

    event_head = (event_head + 1) % SECURITY_EVENT_LOG_CAPACITY;
    if (event_count < SECURITY_EVENT_LOG_CAPACITY)
        event_count++;

    irq_restore(flags);
}

uint32_t security_event_count(void)
{
    uint32_t flags = irq_save();
    uint32_t count = initialized ? event_count : 0;

    irq_restore(flags);
    return count;
}

int security_event_get(uint32_t index, struct security_event *out)
{
    uint32_t flags;
    uint32_t oldest;
    uint32_t slot;

    if (!out)
        return -1;

    flags = irq_save();
    if (!initialized || index >= event_count) {
        irq_restore(flags);
        return -1;
    }

    oldest = (event_head + SECURITY_EVENT_LOG_CAPACITY - event_count) %
             SECURITY_EVENT_LOG_CAPACITY;
    slot = (oldest + index) % SECURITY_EVENT_LOG_CAPACITY;
    *out = events[slot];

    irq_restore(flags);
    return 0;
}
