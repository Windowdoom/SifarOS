; ============================================================================
; SifarOS stage 2 loader
;
; Runs in 16-bit real mode at 0x7E00.  Responsibilities:
;   1. ask the BIOS for the physical memory map (int 15h, EAX=E820h)
;   2. enable the A20 gate so we can reach memory above 1 MiB
;   3. read the kernel image off the boot disk into 0x00010000
;   4. install a flat GDT, switch the CPU into 32-bit protected mode
;   5. jump to the kernel with EBX pointing at the boot information block
; ============================================================================
[BITS 16]
[ORG 0x7E00]

KERNEL_LBA      equ 9                   ; sector 0 = stage1, 1..8 = stage2
KERNEL_SECTORS  equ 512                 ; 256 KiB reserved for the kernel
KERNEL_SEG      equ 0x1000              ; -> physical 0x00010000
CHUNK_SECTORS   equ 64                  ; per int 13h call (32 KiB)

BOOTINFO_ADDR   equ 0x8000              ; boot information block
MMAP_ADDR       equ 0x9000              ; E820 entries (24 bytes each)
BOOTINFO_MAGIC  equ 0x53464F53          ; "SFOS"

stage2_start:
    mov     [boot_drive], dl

    mov     si, msg_stage2
    call    print

    call    detect_memory
    call    enable_a20
    call    load_kernel

    ; ---- fill in the boot information block --------------------------------
    mov     di, BOOTINFO_ADDR
    mov     dword [di + 0], BOOTINFO_MAGIC
    movzx   eax, word [mmap_count]
    mov     dword [di + 4], eax
    mov     dword [di + 8], MMAP_ADDR
    movzx   eax, byte [boot_drive]
    mov     dword [di + 12], eax
    mov     dword [di + 16], KERNEL_LBA
    mov     dword [di + 20], KERNEL_SECTORS

    mov     si, msg_pmode
    call    print

    ; ---- into protected mode ----------------------------------------------
    cli
    lgdt    [gdt_descriptor]
    mov     eax, cr0
    or      eax, 1
    mov     cr0, eax
    jmp     CODE_SEG:protected_entry

; ---------------------------------------------------------------------------
; BIOS memory map
; ---------------------------------------------------------------------------
detect_memory:
    pusha
    xor     ax, ax
    mov     es, ax
    mov     di, MMAP_ADDR
    xor     ebx, ebx
    xor     bp, bp
.loop:
    mov     eax, 0xE820
    mov     edx, 0x534D4150             ; "SMAP"
    mov     ecx, 24
    mov     dword [es:di + 20], 1       ; ACPI 3.0: assume entry is valid
    int     0x15
    jc      .done
    cmp     eax, 0x534D4150
    jne     .done
    jcxz    .skip                       ; zero length descriptor, ignore
    mov     ecx, [es:di + 8]            ; length low
    or      ecx, [es:di + 12]           ; length high
    jz      .skip
    inc     bp
    add     di, 24
.skip:
    test    ebx, ebx
    jnz     .loop
.done:
    mov     [mmap_count], bp
    popa
    ret

; ---------------------------------------------------------------------------
; A20 gate: try the BIOS first, then fall back to the fast A20 port
; ---------------------------------------------------------------------------
enable_a20:
    pusha
    mov     ax, 0x2401
    int     0x15
    jnc     .done
    in      al, 0x92
    test    al, 2
    jnz     .done
    or      al, 2
    and     al, 0xFE                    ; never touch the fast reset bit
    out     0x92, al
.done:
    popa
    ret

; ---------------------------------------------------------------------------
; Pull the kernel image into low memory, 32 KiB at a time
; ---------------------------------------------------------------------------
load_kernel:
    pusha
    mov     word [dap_count], CHUNK_SECTORS
    mov     word [dap_seg], KERNEL_SEG
    mov     word [dap_off], 0
    mov     dword [dap_lba], KERNEL_LBA
    mov     cx, KERNEL_SECTORS / CHUNK_SECTORS
.next:
    push    cx
    mov     si, dap
    mov     ah, 0x42
    mov     dl, [boot_drive]
    int     0x13
    jc      .error
    add     word [dap_seg], (CHUNK_SECTORS * 512) / 16
    add     dword [dap_lba], CHUNK_SECTORS
    mov     al, '.'
    mov     ah, 0x0E
    xor     bx, bx
    int     0x10
    mov     al, '.'
    call    serial_putc
    pop     cx
    loop    .next
    mov     si, msg_crlf
    call    print
    popa
    ret
.error:
    mov     si, msg_kerr
    call    print
.hang:
    hlt
    jmp     .hang

; Mirror everything to the screen and to COM1, which stage 1 already set up.
serial_putc:
    push    dx
    push    ax
    mov     ah, al
.wait:
    mov     dx, 0x3FD
    in      al, dx
    test    al, 0x20
    jz      .wait
    mov     dx, 0x3F8
    mov     al, ah
    out     dx, al
    pop     ax
    pop     dx
    ret

print:
    pusha
    xor     bx, bx
.next:
    lodsb
    test    al, al
    jz      .done
    mov     ah, 0x0E
    int     0x10
    call    serial_putc
    jmp     .next
.done:
    popa
    ret

; ---------------------------------------------------------------------------
; 32-bit land
; ---------------------------------------------------------------------------
[BITS 32]
protected_entry:
    mov     ax, DATA_SEG
    mov     ds, ax
    mov     es, ax
    mov     fs, ax
    mov     gs, ax
    mov     ss, ax
    mov     esp, 0x00090000             ; temporary stack, kernel installs its own
    mov     ebx, BOOTINFO_ADDR
    jmp     CODE_SEG:0x00010000

; ---------------------------------------------------------------------------
; Flat 4 GiB GDT
; ---------------------------------------------------------------------------
align 8
gdt_start:
    dq 0x0000000000000000               ; null
gdt_code:
    dw 0xFFFF, 0x0000
    db 0x00, 10011010b, 11001111b, 0x00
gdt_data:
    dw 0xFFFF, 0x0000
    db 0x00, 10010010b, 11001111b, 0x00
gdt_end:

gdt_descriptor:
    dw gdt_end - gdt_start - 1
    dd gdt_start

CODE_SEG equ gdt_code - gdt_start
DATA_SEG equ gdt_data - gdt_start

; ---------------------------------------------------------------------------
[BITS 16]
align 4
dap:
    db  0x10
    db  0
dap_count:  dw  0
dap_off:    dw  0
dap_seg:    dw  0
dap_lba:    dq  0

boot_drive: db 0
mmap_count: dw 0

msg_stage2: db "SifarOS: stage2", 13, 10, 0
msg_kerr:   db "stage2: kernel read error", 13, 10, 0
msg_pmode:  db "SifarOS: entering protected mode", 13, 10, 0
msg_crlf:   db 13, 10, 0

times (8*512)-($-$$) db 0               ; pad to exactly 8 sectors
