/*
 * User program entry.  The kernel jumps straight to USER_BASE, so whatever
 * lands in .text.start has to be the first thing in the image.
 */
.section .text.start
.global _start
_start:
    xorl    %ebp, %ebp
    call    main
    pushl   %eax
    call    exit                    /* main's return value becomes the status */
.hang:
    jmp     .hang
