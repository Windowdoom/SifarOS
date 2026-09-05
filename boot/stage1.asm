; ============================================================================
; SifarOS stage 1 boot sector (MBR)
;
; The BIOS loads this 512-byte sector at 0x7C00 and jumps to it in 16-bit
; real mode with DL holding the drive we were booted from.  All we do here is
; pull stage 2 off the same disk and hand control over; there is not enough
; room in one sector to do anything more interesting.
; ============================================================================
[BITS 16]
[ORG 0x7C00]

STAGE2_LBA      equ 1           ; stage 2 lives right behind the boot sector
STAGE2_SECTORS  equ 8           ; 4 KiB of stage 2 is plenty
STAGE2_ADDR     equ 0x7E00      ; loaded directly above us

start:
    cli
    xor     ax, ax
    mov     ds, ax
    mov     es, ax
    mov     ss, ax
    mov     sp, 0x7C00          ; stack grows down from our load address
    sti

    mov     [boot_drive], dl

    call    serial_setup
    mov     si, msg_boot
    call    print

    ; --- make sure the BIOS speaks LBA (int 13h extensions) -----------------
    mov     ah, 0x41
    mov     bx, 0x55AA
    mov     dl, [boot_drive]
    int     0x13
    jc      err_noext
    cmp     bx, 0xAA55
    jne     err_noext

    ; --- read stage 2 -------------------------------------------------------
    mov     si, dap
    mov     ah, 0x42
    mov     dl, [boot_drive]
    int     0x13
    jc      err_disk

    mov     dl, [boot_drive]    ; stage 2 wants to know where it came from
    jmp     0x0000:STAGE2_ADDR

err_noext:
    mov     si, msg_noext
    jmp     die
err_disk:
    mov     si, msg_disk
die:
    call    print
.hang:
    hlt
    jmp     .hang

; Configure COM1 for 115200 8N1 so the boot messages are visible headlessly.
serial_setup:
    push    dx
    push    ax
    mov     dx, 0x3F9           ; interrupt enable
    xor     al, al
    out     dx, al
    mov     dx, 0x3FB           ; line control: DLAB on
    mov     al, 0x80
    out     dx, al
    mov     dx, 0x3F8           ; divisor low = 1
    mov     al, 0x01
    out     dx, al
    mov     dx, 0x3F9           ; divisor high = 0
    xor     al, al
    out     dx, al
    mov     dx, 0x3FB           ; 8 bits, no parity, one stop
    mov     al, 0x03
    out     dx, al
    mov     dx, 0x3FC           ; DTR + RTS + OUT2
    mov     al, 0x0B
    out     dx, al
    pop     ax
    pop     dx
    ret

; print AL on COM1, waiting for the transmit holding register to empty
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

; print a NUL terminated string at DS:SI on the screen and the serial line
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

; Disk Address Packet used by int 13h AH=42h
align 4
dap:
    db  0x10                    ; packet size
    db  0                       ; reserved
    dw  STAGE2_SECTORS          ; sectors to transfer
    dw  STAGE2_ADDR             ; destination offset
    dw  0x0000                  ; destination segment
    dq  STAGE2_LBA              ; starting LBA

boot_drive: db 0

msg_boot:   db "SifarOS: stage1", 13, 10, 0
msg_noext:  db "stage1: no int13h LBA support", 13, 10, 0
msg_disk:   db "stage1: disk read error", 13, 10, 0

times 510-($-$$) db 0
dw 0xAA55
