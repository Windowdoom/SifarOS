/*
 * The kernel is a flat binary loaded by our own bootloader at 0x00010000.
 * .text.boot must come first: stage 2 jumps straight to the load address.
 */
ENTRY(_start)

SECTIONS
{
    . = 0x00010000;

    __kernel_start = .;

    .text : ALIGN(4096) {
        *(.text.boot)
        *(.text)
        *(.text.*)
    }

    .rodata : ALIGN(4096) {
        *(.rodata)
        *(.rodata.*)
    }

    .data : ALIGN(4096) {
        *(.data)
        *(.data.*)
    }

    .bss : ALIGN(4096) {
        __bss_start = .;
        *(COMMON)
        *(.bss)
        *(.bss.*)
        __bss_end = .;
    }

    . = ALIGN(4096);
    __kernel_end = .;

    /DISCARD/ : {
        *(.comment)
        *(.note.*)
        *(.eh_frame)
    }
}
