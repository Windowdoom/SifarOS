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
#define SYS_MAX      10

/* Where user programs are loaded and where their stack lives. */
#define USER_BASE       0x40000000u
#define USER_STACK_TOP  0x40800000u
#define USER_MAX_IMAGE  0x00100000u

#endif
