/* User programs are flat binaries loaded at USER_BASE (see sys/syscall.h). */
ENTRY(_start)

SECTIONS
{
    . = 0x40000000;

    .text : {
        *(.text.start)
        *(.text)
        *(.text.*)
    }

    .rodata : { *(.rodata) *(.rodata.*) }
    .data   : { *(.data) *(.data.*) }
    .bss    : { *(COMMON) *(.bss) *(.bss.*) }

    /DISCARD/ : { *(.comment) *(.note.*) *(.eh_frame) }
}
