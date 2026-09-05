#ifndef _KERNEL_SECURITY_H
#define _KERNEL_SECURITY_H

#include <kernel/types.h>

/*
 * Sentinel v1 is deliberately small and kernel-owned. Events contain only
 * copied scalar metadata, never user pointers, so an event remains safe after
 * the originating process exits.
 */
enum security_event_type {
    SECURITY_EVENT_SYSCALL_VIOLATION = 1,
    SECURITY_EVENT_PROCESS_START,
    SECURITY_EVENT_PROCESS_EXIT,
    SECURITY_EVENT_EXEC_REJECTED,
    SECURITY_EVENT_CAPABILITY_DENIED,
    SECURITY_EVENT_INTEGRITY_FAILURE,
    SECURITY_EVENT_RESOURCE_ABUSE,
};

enum security_response {
    SECURITY_RESPONSE_NONE = 0,
    SECURITY_RESPONSE_SUSPICIOUS,
    SECURITY_RESPONSE_QUARANTINE,
    SECURITY_RESPONSE_ISOLATE,
    SECURITY_RESPONSE_KILL,
};

struct security_event {
    uint64_t sequence;
    uint64_t timestamp_ms;
    uint32_t type;
    uint32_t pid;
    uint32_t code;
    uint32_t response;
};

#define SECURITY_EVENT_LOG_CAPACITY 128u

void     security_init(void);
void     security_event_record(enum security_event_type type, uint32_t pid,
                               uint32_t code,
                               enum security_response response);
uint32_t security_event_count(void);
int      security_event_get(uint32_t index, struct security_event *out);

#endif
