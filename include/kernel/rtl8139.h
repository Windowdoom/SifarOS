#ifndef _KERNEL_RTL8139_H
#define _KERNEL_RTL8139_H

#include <kernel/types.h>

int            rtl8139_init(void);
const uint8_t *rtl8139_mac(void);
int            rtl8139_send(const void *frame, size_t length);
int            rtl8139_poll(void *out, size_t capacity);
uint16_t       rtl8139_io_base(void);

#endif
