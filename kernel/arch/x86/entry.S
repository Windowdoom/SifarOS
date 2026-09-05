/*
 * Kernel entry point.  Stage 2 jumps here at physical 0x00010000 in 32-bit
 * protected mode with a flat GDT already loaded and EBX pointing at the boot
 * information block.
 */
.section .text.boot
.global _start
.type _start, @function

_start:
    cli
    movl    $stack_top, %esp
    movl    %esp, %ebp

    /* The flat binary carries no .bss, so clear it ourselves. */
    movl    $__bss_start, %edi
    movl    $__bss_end, %ecx
    subl    %edi, %ecx
    xorl    %eax, %eax
    cld
    rep stosb

    pushl   %ebx                    /* struct bootinfo * */
    call    kmain
    addl    $4, %esp

.hang:
    cli
    hlt
    jmp     .hang

.section .bss
.align 16
stack_bottom:
    .skip 32768                     /* 32 KiB boot stack */
stack_top:
