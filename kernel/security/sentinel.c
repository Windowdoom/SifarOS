/*
 * Sentinel security monitor.
 *
 * Sentinel records security events in a bounded kernel-owned ring and applies
 * a deliberately small escalation policy to repeated syscall-boundary abuse.
 * It never trusts or stores userspace pointers.
 *
 *   NORMAL -> SUSPICIOUS -> QUARANTINE -> ISOLATE -> KILL
 *
 * Quarantine revokes network and cross-process/system control. Isolation
 * revokes every non-kernel capability. A sixth violation terminates the
 * current offending userspace process from the syscall boundary.
 */
#include <kernel/security.h>
#include <kernel/proc.h>
#include <kernel/sched.h>
#include <kernel/string.h>
#include <kernel/io.h>
#include <arch/x86.h>

#define SUBJECT_COUNT MAX_PROCESSES
#define QUARANTINE_CAPS (PROC_CAP_NETWORK | PROC_CAP_WINDOW_CONTROL | \
                         PROC_CAP_SYSTEM_CONTROL | PROC_CAP_PROCESS_CONTROL)

struct sentinel_subject {
    uint32_t pid;
    uint32_t score;
};

static struct security_event events[SECURITY_EVENT_LOG_CAPACITY];
static struct sentinel_subject subjects[SUBJECT_COUNT];
static uint32_t event_head;
static uint32_t event_count;
static uint64_t next_sequence;
static uint8_t initialized;
static uint8_t enforcing;

void security_init(void)
{
    memset(events, 0, sizeof(events));
    memset(subjects, 0, sizeof(subjects));
    event_head = 0;
    event_count = 0;
    next_sequence = 1;
    initialized = 1;
    enforcing = 0;
}

static struct sentinel_subject *subject_for(uint32_t pid, int create)
{
    struct sentinel_subject *free_slot = NULL;

    if (pid == 0)
        return NULL;

    for (uint32_t i = 0; i < SUBJECT_COUNT; i++) {
        if (subjects[i].pid == pid)
            return &subjects[i];
        if (subjects[i].pid && !proc_by_pid((int)subjects[i].pid)) {
            subjects[i].pid = 0;
            subjects[i].score = 0;
        }
        if (!subjects[i].pid && !free_slot)
            free_slot = &subjects[i];
    }

    if (create && free_slot) {
        free_slot->pid = pid;
        free_slot->score = 0;
        return free_slot;
    }
    return NULL;
}

static void event_store(enum security_event_type type, uint32_t pid,
                        uint32_t code, enum security_response response)
{
    struct security_event *event;
    uint32_t flags = irq_save();

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

void security_event_record(enum security_event_type type, uint32_t pid,
                           uint32_t code, enum security_response response)
{
    struct process *current;

    if (!initialized)
        security_init();

    /* Existing syscall/capability denial sites already report a suspicious
     * event. Upgrade those calls into the active policy when they describe the
     * current user process. The enforcing guard avoids recursion when the
     * policy stores its final escalated event. */
    current = proc_current();
    if (!enforcing && response == SECURITY_RESPONSE_SUSPICIOUS && current &&
        current != proc_kernel() && pid == (uint32_t)current->pid &&
        (type == SECURITY_EVENT_SYSCALL_VIOLATION ||
         type == SECURITY_EVENT_CAPABILITY_DENIED)) {
        enforcing = 1;
        (void)security_syscall_violation(code);
        enforcing = 0;
        return;
    }

    event_store(type, pid, code, response);
}

uint32_t security_process_score(uint32_t pid)
{
    struct sentinel_subject *subject;
    uint32_t flags;
    uint32_t score = 0;

    if (!initialized)
        return 0;
    flags = irq_save();
    subject = subject_for(pid, 0);
    if (subject)
        score = subject->score;
    irq_restore(flags);
    return score;
}

void security_process_forget(uint32_t pid)
{
    uint32_t flags;

    if (!initialized || pid == 0)
        return;
    flags = irq_save();
    for (uint32_t i = 0; i < SUBJECT_COUNT; i++) {
        if (subjects[i].pid == pid) {
            subjects[i].pid = 0;
            subjects[i].score = 0;
            break;
        }
    }
    irq_restore(flags);
}

enum security_response security_syscall_violation(uint32_t code)
{
    struct process *proc = proc_current();
    struct sentinel_subject *subject;
    enum security_response response;
    uint32_t score;
    uint32_t flags;

    if (!initialized)
        security_init();

    if (!proc || proc == proc_kernel()) {
        event_store(SECURITY_EVENT_SYSCALL_VIOLATION, 0, code,
                    SECURITY_RESPONSE_SUSPICIOUS);
        return SECURITY_RESPONSE_SUSPICIOUS;
    }

    flags = irq_save();
    subject = subject_for((uint32_t)proc->pid, 1);
    if (!subject) {
        irq_restore(flags);
        event_store(SECURITY_EVENT_RESOURCE_ABUSE, (uint32_t)proc->pid,
                    code, SECURITY_RESPONSE_ISOLATE);
        proc_revoke_caps(proc->pid, PROC_CAP_ALL);
        return SECURITY_RESPONSE_ISOLATE;
    }
    if (subject->score < 0xFFFFFFFFu)
        subject->score++;
    score = subject->score;
    irq_restore(flags);

    if (score >= 6)
        response = SECURITY_RESPONSE_KILL;
    else if (score >= 5)
        response = SECURITY_RESPONSE_ISOLATE;
    else if (score >= 3)
        response = SECURITY_RESPONSE_QUARANTINE;
    else
        response = SECURITY_RESPONSE_SUSPICIOUS;

    if (response == SECURITY_RESPONSE_QUARANTINE)
        proc_revoke_caps(proc->pid, QUARANTINE_CAPS);
    else if (response >= SECURITY_RESPONSE_ISOLATE)
        proc_revoke_caps(proc->pid, PROC_CAP_ALL);

    event_store(SECURITY_EVENT_SYSCALL_VIOLATION,
                (uint32_t)proc->pid, code, response);

    if (response == SECURITY_RESPONSE_KILL)
        proc_exit(-126);

    return response;
}

uint32_t security_event_count(void)
{
    if (!initialized)
        return 0;
    return event_count;
}

int security_event_get(uint32_t index, struct security_event *out)
{
    uint32_t oldest;
    uint32_t slot;
    uint32_t flags;

    if (!initialized || !out)
        return -1;

    flags = irq_save();
    if (index >= event_count) {
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
