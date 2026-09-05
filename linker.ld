/*
 * The kernel is a flat binary loaded by our own bootloader at 0x00010000.
 * .text.boot must come first: stage 2 jumps straight to the load address.
 *
 * The section boundary symbols are also consumed by paging.c so SifarOS can
 * enforce W^X once PAE/NX paging is enabled: text is RX, rodata is R+NX and
 * writable kernel data is RW+NX.
 */
ENTRY(_start)

SECTIONS
{
    . = 0x00010000;

    __kernel_start = .;

    .text : ALIGN(4096) {
        __text_start = .;
        *(.text.boot)
        *(.text)
        *(.text.*)
        __text_end = .;
    }

    .rodata : ALIGN(4096) {
        __rodata_start = .;
        *(.rodata)
        *(.rodata.*)
        __rodata_end = .;
    }

    .data : ALIGN(4096) {
        __data_start = .;
        *(.data)
        *(.data.*)
        __data_end = .;
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
