/*
 * User program entry.
 *
 * The kernel builds the initial stack as [argc][argv0][argv1]...[NULL], so
 * argc is at the top of the stack and the argv array starts right behind it.
 */
.section .text.start
.global _start
_start:
    xorl    %ebp, %ebp
    movl    (%esp), %eax            /* argc */
    leal    4(%esp), %edx           /* argv */
    pushl   %edx
    pushl   %eax
    call    main
    addl    $8, %esp
    pushl   %eax                    /* main's return value is the status */
    call    exit
.hang:
    jmp     .hang
