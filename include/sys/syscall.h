#ifndef _SYS_SYSCALL_H
#define _SYS_SYSCALL_H

/*
 * System call numbers.  Shared by the kernel dispatcher and the user-space
 * library, which is why this header stays free of kernel types.
 *
 * Calling convention: int $0x80 with the call number in EAX and up to three
 * arguments in EBX, ECX and EDX.  The result comes back in EAX.
 */
#define SYS_EXIT     0
#define SYS_WRITE    1      /* (fd, buf, len) - fd 1 and 2 are the console */
#define SYS_READ     2      /* (fd, buf, len) - fd 0 is the console, blocking */
#define SYS_YIELD    3
#define SYS_SLEEP    4      /* (milliseconds) */
#define SYS_GETPID   5
#define SYS_UPTIME   6      /* milliseconds since boot */
#define SYS_FS_WRITE 7      /* (path, buf, len) - replace file contents */
#define SYS_FS_READ  8      /* (path, buf, len) - read from offset zero */
#define SYS_PUTC     9      /* (character) */
#define SYS_SBRK     10     /* (increment) -> previous break */
#define SYS_SPAWN    11     /* (path, argv, argc) -> pid */
#define SYS_WAIT     12     /* (pid) -> exit status */
#define SYS_MAX      13

/* ---- filesystem ---- */
#define SYS_OPENDIR   20    /* (path, entries, max) -> count */
#define SYS_STAT      21    /* (path, struct sys_stat *) */
#define SYS_UNLINK    22    /* (path) */
#define SYS_MKDIR     23    /* (path) */
#define SYS_FS_APPEND 24    /* (path, buf, len) */
#define SYS_CHDIR     25    /* (path) */
#define SYS_GETCWD    26    /* (buf, len) */

/* ---- window system ---- */
#define SYS_GUI_CREATE     30   /* (width, height, title) -> window id */
#define SYS_GUI_INFO       31   /* (id, struct gui_window_info *) */
#define SYS_GUI_INVALIDATE 32   /* (id, packed x/y, packed w/h) */
#define SYS_GUI_POLL       33   /* (id, struct gui_event *) -> 1 if an event */
#define SYS_GUI_WAIT       34   /* (id, struct gui_event *, timeout ms) */
#define SYS_GUI_DESTROY    35   /* (id) */
#define SYS_GUI_TITLE      36   /* (id, title) */
#define SYS_GUI_MOVE       37   /* (id, x, y) */
#define SYS_GUI_RESIZE     38   /* (id, width, height) */
#define SYS_GUI_LIST       39   /* (struct gui_window_desc *, max) -> count */
#define SYS_GUI_ACTIVATE   40   /* (id) */
#define SYS_GUI_MINIMIZE   41   /* (id) */
#define SYS_GUI_SCREEN     42   /* (struct gui_screen_info *) */
#define SYS_GUI_FLAGS      43   /* (id, flags) */

/* ---- system information ---- */
#define SYS_SYSINFO   50    /* (struct sys_info *) */
#define SYS_PROCLIST  51    /* (struct sys_proc *, max) -> count */
#define SYS_KILL      52    /* (pid) */
#define SYS_LOG       53    /* (buf, len) -> bytes of kernel log */
#define SYS_TIME      54    /* (struct sys_time *) */
#define SYS_REBOOT    55
#define SYS_SHUTDOWN  56
#define SYS_FONT      57    /* (buf, len) -> copies the 8x16 console font */

/* ---- network service ---- */
#define SYS_NET_INFO  60    /* (struct net_info *) */
#define SYS_HTTP_GET  61    /* (struct net_http_request *, out, capacity) */

/* Where user programs are loaded and where their stack lives. */
#define USER_BASE       0x40000000u
#define USER_STACK_TOP  0x40800000u
#define USER_MAX_IMAGE  0x00100000u

#endif
