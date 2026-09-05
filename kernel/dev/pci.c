#include <kernel/pci.h>
#include <kernel/io.h>
#include <kernel/string.h>

#define PCI_CONFIG_ADDR 0xCF8
#define PCI_CONFIG_DATA 0xCFC

static uint32_t pci_address(uint8_t bus, uint8_t slot, uint8_t function, uint8_t offset)
{
    return 0x80000000u |
           ((uint32_t)bus << 16) |
           ((uint32_t)(slot & 0x1F) << 11) |
           ((uint32_t)(function & 0x07) << 8) |
           (offset & 0xFCu);
}

uint32_t pci_read_config32(uint8_t bus, uint8_t slot, uint8_t function, uint8_t offset)
{
    outl(PCI_CONFIG_ADDR, pci_address(bus, slot, function, offset));
    return inl(PCI_CONFIG_DATA);
}

void pci_write_config32(uint8_t bus, uint8_t slot, uint8_t function,
                        uint8_t offset, uint32_t value)
{
    outl(PCI_CONFIG_ADDR, pci_address(bus, slot, function, offset));
    outl(PCI_CONFIG_DATA, value);
}

static void pci_fill(uint8_t bus, uint8_t slot, uint8_t function,
                     struct pci_device *out)
{
    uint32_t id = pci_read_config32(bus, slot, function, 0x00);
    uint32_t class_rev = pci_read_config32(bus, slot, function, 0x08);
    uint32_t intr = pci_read_config32(bus, slot, function, 0x3C);

    memset(out, 0, sizeof(*out));
    out->bus = bus;
    out->slot = slot;
    out->function = function;
    out->vendor_id = (uint16_t)(id & 0xFFFFu);
    out->device_id = (uint16_t)(id >> 16);
    out->prog_if = (uint8_t)((class_rev >> 8) & 0xFFu);
    out->subclass = (uint8_t)((class_rev >> 16) & 0xFFu);
    out->class_code = (uint8_t)((class_rev >> 24) & 0xFFu);
    out->irq_line = (uint8_t)(intr & 0xFFu);
    for (int i = 0; i < 6; i++)
        out->bar[i] = pci_read_config32(bus, slot, function, (uint8_t)(0x10 + i * 4));
}

int pci_find_device(uint16_t vendor, uint16_t device, struct pci_device *out)
{
    for (uint16_t bus = 0; bus < 256; bus++) {
        for (uint8_t slot = 0; slot < 32; slot++) {
            for (uint8_t function = 0; function < 8; function++) {
                uint32_t id = pci_read_config32((uint8_t)bus, slot, function, 0x00);
                uint16_t found_vendor = (uint16_t)(id & 0xFFFFu);
                uint16_t found_device = (uint16_t)(id >> 16);

                if (found_vendor == 0xFFFFu)
                    continue;
                if (found_vendor == vendor && found_device == device) {
                    if (out)
                        pci_fill((uint8_t)bus, slot, function, out);
                    return 0;
                }
            }
        }
    }
    return -1;
}

int pci_enable_busmaster(const struct pci_device *device)
{
    uint32_t command;

    if (!device)
        return -1;
    command = pci_read_config32(device->bus, device->slot, device->function, 0x04);
    command |= 0x00000007u; /* I/O space + memory space + bus mastering */
    pci_write_config32(device->bus, device->slot, device->function, 0x04, command);
    return 0;
}
