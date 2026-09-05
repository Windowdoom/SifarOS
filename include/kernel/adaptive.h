#ifndef _KERNEL_ADAPTIVE_H
#define _KERNEL_ADAPTIVE_H

#include <kernel/types.h>

enum adaptive_mode {
    ADAPTIVE_BALANCED = 0,
    ADAPTIVE_RESPONSIVE,
    ADAPTIVE_PRESSURE,
    ADAPTIVE_DEFENSIVE,
    ADAPTIVE_QUIET,
};

struct adaptive_snapshot {
    uint32_t generation;
    uint32_t mode;
    uint32_t runnable_threads;
    uint32_t process_count;
    uint32_t free_memory_percent;
    uint32_t threat_score;
    uint32_t scheduler_quantum_ticks;
    uint32_t background_interval_ms;
    uint32_t network_limit_bytes;
};

void adaptive_init(void);
int  adaptive_start(void);
void adaptive_get_snapshot(struct adaptive_snapshot *out);
const char *adaptive_mode_name(enum adaptive_mode mode);

/* Inputs from other kernel subsystems. */
void adaptive_note_security(uint32_t response_level);
void adaptive_note_interaction(void);

/* Bounded policy outputs consumed by subsystems. */
uint32_t adaptive_background_interval_ms(void);
size_t   adaptive_network_limit(size_t requested);
int      adaptive_network_allowed(void);

#endif
