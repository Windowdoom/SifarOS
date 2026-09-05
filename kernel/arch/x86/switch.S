/*
 * Kernel thread context switch.
 *
 *   context_switch(uint32_t *save_esp, uint32_t new_esp)
 *
 * Callee-saved registers and the flags go on the outgoing thread's stack, the
 * stack pointer is swapped, and the incoming thread's state is popped back.
 * Execution resumes wherever that thread last called in from.
 */
.section .text
.global context_switch
.type context_switch, @function
context_switch:
    movl    4(%esp), %eax           /* where to store the old stack pointer */
    movl    8(%esp), %edx           /* stack pointer to switch to */

    pushl   %ebp
    pushl   %ebx
    pushl   %esi
    pushl   %edi
    pushfl

    movl    %esp, (%eax)
    movl    %edx, %esp

    popfl
    popl    %edi
    popl    %esi
    popl    %ebx
    popl    %ebp
    ret

/*
 * First thing a brand new thread runs.  thread_create() seeds the stack so
 * that ESI holds the entry point and EDI the argument.
 */
.global thread_trampoline
.type thread_trampoline, @function
thread_trampoline:
    pushl   %edi                    /* arg */
    call    *%esi                   /* entry(arg) */
    addl    $4, %esp
    pushl   $0
    call    thread_exit             /* never returns */
.hang:
    hlt
    jmp     .hang
