#ifndef _KERNEL_PCI_H
#define _KERNEL_PCI_H

#include <kernel/types.h>

struct pci_device {
    uint8_t  bus;
    uint8_t  slot;
    uint8_t  function;
    uint16_t vendor_id;
    uint16_t device_id;
    uint8_t  class_code;
    uint8_t  subclass;
    uint8_t  prog_if;
    uint8_t  irq_line;
    uint32_t bar[6];
};

uint32_t pci_read_config32(uint8_t bus, uint8_t slot, uint8_t function, uint8_t offset);
void     pci_write_config32(uint8_t bus, uint8_t slot, uint8_t function,
                            uint8_t offset, uint32_t value);
int      pci_find_device(uint16_t vendor, uint16_t device, struct pci_device *out);
int      pci_enable_busmaster(const struct pci_device *device);

#endif
