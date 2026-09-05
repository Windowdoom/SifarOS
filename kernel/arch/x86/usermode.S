/*
 * Drop to ring 3.
 *
 *   enter_usermode(uint32_t entry, uint32_t user_stack)
 *
 * There is no instruction that simply lowers the privilege level, so we forge
 * the stack frame an interrupt would have pushed and return from it.
 */
.section .text
.global enter_usermode
.type enter_usermode, @function
enter_usermode:
    movl    4(%esp), %ecx           /* entry point */
    movl    8(%esp), %edx           /* user stack pointer */

    cli
    movw    $0x23, %ax              /* user data selector, RPL 3 */
    movw    %ax, %ds
    movw    %ax, %es
    movw    %ax, %fs
    movw    %ax, %gs

    pushl   $0x23                   /* ss */
    pushl   %edx                    /* esp */
    pushfl
    popl    %eax
    orl     $0x200, %eax            /* re-enable interrupts in ring 3 */
    pushl   %eax                    /* eflags */
    pushl   $0x1B                   /* cs: user code selector, RPL 3 */
    pushl   %ecx                    /* eip */
    iret
