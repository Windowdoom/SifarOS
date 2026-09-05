/*
 * User programs are static ELF executables loaded at USER_BASE.
 *
 * Keep code, constants, and writable state in distinct PT_LOAD segments.
 * This lets the hardened ELF loader reject writable+executable images and map
 * writable pages only where the program actually needs them. Each protection
 * boundary is page aligned because x86 page permissions are page-granular.
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
