; ============================================================================
; SifarOS stage 2 loader
;
; Runs in 16-bit real mode at 0x7E00.  Everything that needs the BIOS has to
; happen here, because once we are in protected mode the BIOS is gone:
;
;   1. ask the BIOS for the physical memory map (int 15h, EAX=E820h)
;   2. copy the 8x16 VGA ROM font out of the video BIOS
;   3. enable the A20 gate so we can reach memory above 1 MiB
;   4. read the kernel off the boot disk into 0x00010000
;   5. find and set a 32-bit VESA linear framebuffer mode
;   6. install a flat GDT and switch the CPU into 32-bit protected mode
;   7. jump to the kernel with EBX pointing at the boot information block
; ============================================================================
[BITS 16]
[ORG 0x7E00]

KERNEL_LBA      equ 9                   ; sector 0 = stage1, 1..8 = stage2
KERNEL_SECTORS  equ 1024                ; 512 KiB reserved for the kernel
KERNEL_SEG      equ 0x1000              ; -> physical 0x00010000
CHUNK_SECTORS   equ 64                  ; per int 13h call (32 KiB)

BOOTINFO_ADDR   equ 0x8000              ; boot information block
MMAP_ADDR       equ 0x9000              ; E820 entries (24 bytes each)
VBE_INFO        equ 0xA000              ; VBE controller information block
MODE_INFO       equ 0xA200              ; VBE mode information block
FONT_ADDR       equ 0xB000              ; 4 KiB of 8x16 glyph bitmaps
BOOTINFO_MAGIC  equ 0x53464F53          ; "SFOS"

stage2_start:
    mov     [boot_drive], dl

    mov     si, msg_stage2
    call    print

    call    detect_memory
    call    copy_rom_font
    call    enable_a20
    call    load_kernel

    mov     si, msg_video
    call    print
    call    setup_video                 ; from here on, no more BIOS text output

    ; ---- fill in the boot information block --------------------------------
    xor     ax, ax
    mov     es, ax
    mov     di, BOOTINFO_ADDR
    mov     dword [es:di + 0], BOOTINFO_MAGIC
    movzx   eax, word [mmap_count]
    mov     dword [es:di + 4], eax
    mov     dword [es:di + 8], MMAP_ADDR
    movzx   eax, byte [boot_drive]
    mov     dword [es:di + 12], eax
    mov     dword [es:di + 16], KERNEL_LBA
    mov     dword [es:di + 20], KERNEL_SECTORS
    mov     eax, [fb_addr]
    mov     dword [es:di + 24], eax
    movzx   eax, word [fb_width]
    mov     dword [es:di + 28], eax
    movzx   eax, word [fb_height]
    mov     dword [es:di + 32], eax
    movzx   eax, word [fb_pitch]
    mov     dword [es:di + 36], eax
    movzx   eax, byte [fb_bpp]
    mov     dword [es:di + 40], eax
    movzx   eax, byte [fb_ok]
    mov     dword [es:di + 44], eax
    mov     dword [es:di + 48], FONT_ADDR

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
; The video BIOS carries the 8x16 text font in ROM.  int 10h/1130h hands us a
; pointer to it; the kernel uses those glyphs to draw text in graphics mode.
; ---------------------------------------------------------------------------
copy_rom_font:
    pusha
    push    es
    push    ds

    mov     ax, 0x1130
    mov     bh, 0x06                    ; 8x16 ROM font
    int     0x10                        ; returns ES:BP

    mov     ax, es
    mov     ds, ax
    mov     si, bp
    xor     ax, ax
    mov     es, ax
    mov     di, FONT_ADDR
    mov     cx, 4096 / 2
    cld
    rep movsw

    pop     ds
    pop     es
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

; ---------------------------------------------------------------------------
; Find a 32 bit linear framebuffer mode and switch to it.
;
; We walk the VBE mode list once per entry in want_modes, so the first
; resolution the card actually supports wins.
; ---------------------------------------------------------------------------
setup_video:
    pusha

    xor     ax, ax
    mov     es, ax
    mov     di, VBE_INFO
    mov     dword [es:di], 'VBE2'       ; ask for VBE 2.0 style information
    mov     ax, 0x4F00
    int     0x10
    cmp     ax, 0x004F
    jne     .fail

    mov     si, want_modes
.next_wanted:
    mov     ax, [si]
    test    ax, ax
    jz      .fail                       ; ran out of preferred resolutions
    mov     [want_w], ax
    mov     ax, [si + 2]
    mov     [want_h], ax
    push    si

    ; walk the mode list for this resolution
    xor     ax, ax
    mov     es, ax
    mov     bx, [es:VBE_INFO + 14]      ; far pointer to the mode list
    mov     ax, [es:VBE_INFO + 16]
    mov     fs, ax
    mov     si, bx
.next_mode:
    mov     cx, [fs:si]
    add     si, 2
    cmp     cx, 0xFFFF
    je      .no_match

    push    si
    push    cx
    xor     ax, ax
    mov     es, ax
    mov     di, MODE_INFO
    mov     ax, 0x4F01
    int     0x10
    pop     cx
    pop     si
    cmp     ax, 0x004F
    jne     .next_mode

    xor     ax, ax
    mov     es, ax
    mov     ax, [es:MODE_INFO + 0]      ; mode attributes
    test    ax, 0x0080                  ; linear framebuffer available?
    jz      .next_mode
    test    ax, 0x0010                  ; graphics (not text) mode?
    jz      .next_mode
    cmp     byte [es:MODE_INFO + 25], 32
    jne     .next_mode
    mov     ax, [es:MODE_INFO + 18]     ; width
    cmp     ax, [want_w]
    jne     .next_mode
    mov     ax, [es:MODE_INFO + 20]     ; height
    cmp     ax, [want_h]
    jne     .next_mode

    ; this one will do
    mov     bx, cx
    or      bx, 0x4000                  ; use the linear framebuffer
    mov     ax, 0x4F02
    int     0x10
    cmp     ax, 0x004F
    jne     .next_mode

    xor     ax, ax
    mov     es, ax
    mov     ax, [es:MODE_INFO + 16]
    mov     [fb_pitch], ax
    mov     ax, [es:MODE_INFO + 18]
    mov     [fb_width], ax
    mov     ax, [es:MODE_INFO + 20]
    mov     [fb_height], ax
    mov     al, [es:MODE_INFO + 25]
    mov     [fb_bpp], al
    mov     eax, [es:MODE_INFO + 40]
    mov     [fb_addr], eax
    mov     byte [fb_ok], 1

    pop     si
    popa
    ret

.no_match:
    pop     si
    add     si, 4
    jmp     .next_wanted

.fail:
    mov     byte [fb_ok], 0
    popa
    ret

; ---------------------------------------------------------------------------
; Mirror everything to the screen and to COM1, which stage 1 already set up.
; ---------------------------------------------------------------------------
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

; Preferred resolutions, best first.  Terminated by a zero width.
want_modes:
    dw 1024, 768
    dw 1280, 800
    dw 800, 600
    dw 640, 480
    dw 0, 0

want_w:     dw 0
want_h:     dw 0
fb_addr:    dd 0
fb_pitch:   dw 0
fb_width:   dw 0
fb_height:  dw 0
fb_bpp:     db 0
fb_ok:      db 0

msg_stage2: db "SifarOS: stage2", 13, 10, 0
msg_kerr:   db "stage2: kernel read error", 13, 10, 0
msg_video:  db "SifarOS: setting graphics mode", 13, 10, 0
msg_crlf:   db 13, 10, 0

times (8*512)-($-$$) db 0               ; pad to exactly 8 sectors
