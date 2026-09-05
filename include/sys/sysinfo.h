#ifndef _SYS_SYSINFO_H
#define _SYS_SYSINFO_H

/* Structures shared between the kernel and user space for system queries. */

#define SYS_NAME_MAX 32

struct sys_info {
    unsigned int uptime_ms;
    unsigned int total_memory_kb;
    unsigned int used_memory_kb;
    unsigned int heap_used_kb;
    unsigned int heap_total_kb;
    unsigned int processes;
    unsigned int threads;
    unsigned int screen_width;
    unsigned int screen_height;
    unsigned int disk_total_kb;
    unsigned int disk_free_kb;
    char         cpu[52];
    char         version[24];
};

struct sys_proc {
    unsigned int pid;
    unsigned int parent;
    unsigned int state;         /* 1 running, 2 zombie */
    unsigned int memory_kb;
    unsigned int cpu_ms;
    char         name[SYS_NAME_MAX];
};

struct sys_time {
    unsigned int year, month, day;
    unsigned int hour, minute, second;
};

struct sys_dirent {
    unsigned int type;          /* 1 file, 2 directory */
    unsigned int size;
    char         name[SYS_NAME_MAX];
};

struct sys_stat {
    unsigned int type;
    unsigned int size;
    unsigned int readonly;
};

#endif
