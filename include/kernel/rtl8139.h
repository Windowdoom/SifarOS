#ifndef _KERNEL_RTL8139_H
#define _KERNEL_RTL8139_H

#include <kernel/types.h>

#define RTL8139_VENDOR_ID 0x10ECu
#define RTL8139_DEVICE_ID 0x8139u

int            rtl8139_init(void);
int            rtl8139_ready(void);
const uint8_t *rtl8139_mac(void);
int            rtl8139_send(const void *frame, size_t length);
int            rtl8139_poll(void *out, size_t capacity);
uint16_t       rtl8139_io_base(void);

#endif
