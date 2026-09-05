/*
 * Sentinel security monitor, v1.
 *
 * Sentinel is intentionally passive in this first stage: it records security
 * events in a bounded kernel-owned ring. Future stages will attach policy,
 * capability revocation, process isolation and rollback to these events.
 *
 * The monitor never trusts data supplied by a process and never stores a
 * pointer into userspace. That makes the event log safe to consult after the
 * process that triggered an event has been terminated.
 */
#include <kernel/security.h>
#include <kernel/sched.h>
#include <kernel/string.h>

static struct security_event events[SECURITY_EVENT_LOG_CAPACITY];
static uint32_t event_head;
static uint32_t event_count;
static uint64_t next_sequence;

void security_init(void)
{
    memset(events, 0, sizeof(events));
    event_head = 0;
    event_count = 0;
    next_sequence = 1;
}

void security_event_record(enum security_event_type type, uint32_t pid,
                           uint32_t code, enum security_response response)
{
    struct security_event *event = &events[event_head];

    event->sequence = next_sequence++;
    event->timestamp_ms = timer_ms();
    event->type = (uint32_t)type;
    event->pid = pid;
    event->code = code;
    event->response = (uint32_t)response;

    event_head = (event_head + 1) % SECURITY_EVENT_LOG_CAPACITY;
    if (event_count < SECURITY_EVENT_LOG_CAPACITY)
        event_count++;
}

uint32_t security_event_count(void)
{
    return event_count;
}

int security_event_get(uint32_t index, struct security_event *out)
{
    uint32_t oldest;
    uint32_t slot;

    if (!out || index >= event_count)
        return -1;

    oldest = (event_head + SECURITY_EVENT_LOG_CAPACITY - event_count) %
             SECURITY_EVENT_LOG_CAPACITY;
    slot = (oldest + index) % SECURITY_EVENT_LOG_CAPACITY;
    *out = events[slot];
    return 0;
}
