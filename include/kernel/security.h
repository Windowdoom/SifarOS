#ifndef _KERNEL_SECURITY_H
#define _KERNEL_SECURITY_H

#include <kernel/types.h>

/* Security events are deliberately small: this path must remain safe even
 * when the event was caused by malformed or hostile user input. */
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

/* Machine-readable causes are kept separate from the syscall number so
 * Sentinel policy and future observers do not have to infer intent from ABI
 * details. Values are append-only because they form part of the event ABI. */
enum security_violation_reason {
    SECURITY_REASON_NONE = 0,
    SECURITY_REASON_INVALID_SYSCALL,
    SECURITY_REASON_FS_WRITE_DENIED,
    SECURITY_REASON_FS_APPEND_DENIED,
    SECURITY_REASON_FS_UNLINK_DENIED,
    SECURITY_REASON_FS_MKDIR_DENIED,
    SECURITY_REASON_WINDOW_CONTROL_DENIED,
    SECURITY_REASON_PROCESS_CONTROL_DENIED,
    SECURITY_REASON_SYSTEM_CONTROL_DENIED,
    SECURITY_REASON_NETWORK_DENIED,
};

struct security_event {
    uint64_t sequence;
    uint64_t timestamp_ms;
    uint32_t type;
    uint32_t pid;
    uint32_t code;
    uint32_t reason;
    uint32_t response;
};

#define SECURITY_EVENT_LOG_CAPACITY 128u

void security_init(void);
void security_event_record(enum security_event_type type, uint32_t pid,
                           uint32_t code, enum security_response response);
void security_capability_denied(enum security_violation_reason reason,
                                uint32_t syscall_number);
uint32_t security_event_count(void);
int security_event_get(uint32_t index, struct security_event *out);

/* Active Sentinel policy for a violation committed by the current process.
 * Strike 1-2: suspicious, 3-4: quarantine/revoke dangerous capabilities,
 * 5: isolate/revoke all capabilities, 6+: terminate the offending process. */
enum security_response security_syscall_violation(uint32_t code);
uint32_t security_process_score(uint32_t pid);
void security_process_forget(uint32_t pid);

#endif
