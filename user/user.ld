/*
 * User programs are static ELF executables loaded at USER_BASE.
 *
 * The layout is split into three load segments so that no segment is both
 * writable and executable: code is read plus execute, constants are read
 * only, and data and bss are read plus write.  The kernel maps each segment
 * with the permissions declared here, so this is what makes W^X possible on
 * the loader side.  Each segment starts on a page boundary because page
 * permissions cannot be finer than a page.
 */
ENTRY(_start)

PHDRS
{
    text   PT_LOAD FLAGS(5);    /* read + execute */
    rodata PT_LOAD FLAGS(4);    /* read only */
    data   PT_LOAD FLAGS(6);    /* read + write */
}

SECTIONS
{
    . = 0x40000000;

    .text : ALIGN(4096) {
        *(.text.start)
        *(.text)
        *(.text.*)
    } :text

    . = ALIGN(4096);
    .rodata : ALIGN(4096) {
        *(.rodata)
        *(.rodata.*)
    } :rodata

    . = ALIGN(4096);
    .data : ALIGN(4096) {
        *(.data)
        *(.data.*)
    } :data

    .bss : ALIGN(16) {
        *(COMMON)
        *(.bss)
        *(.bss.*)
    } :data

    /DISCARD/ : { *(.comment) *(.note.*) *(.eh_frame) }
}
