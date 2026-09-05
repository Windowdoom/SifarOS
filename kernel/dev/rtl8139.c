/*
 * RTL8139 Ethernet driver.
 *
 * SifarOS uses the well-understood RTL8139 as the first network device because
 * QEMU emulates it consistently on Intel and Apple Silicon hosts. The driver
 * is polling-only for now. DMA buffers come from the PMM's low direct-mapped
 * pool, so the physical address written to the NIC is also a valid kernel
 * pointer without a second mapping.
 */
#include <kernel/rtl8139.h>
#include <kernel/pci.h>
#include <kernel/mm.h>
#include <kernel/io.h>
#include <kernel/string.h>
#include <arch/x86.h>

#define RTL_IDR0       0x00u
#define RTL_TSD0       0x10u
#define RTL_TSAD0      0x20u
#define RTL_RBSTART    0x30u
#define RTL_COMMAND    0x37u
#define RTL_CAPR       0x38u
#define RTL_IMR        0x3Cu
#define RTL_ISR        0x3Eu
#define RTL_TCR        0x40u
#define RTL_RCR        0x44u
#define RTL_CONFIG1    0x52u

#define CMD_RX_ENABLE  0x08u
#define CMD_TX_ENABLE  0x04u
#define CMD_RESET      0x10u
#define CMD_RX_EMPTY   0x01u

#define RX_ROK         0x0001u
#define RX_SIZE        8192u
#define RX_SLACK       (16u + 1536u)
#define RX_BYTES       (RX_SIZE + RX_SLACK)
#define RX_PAGES       ((RX_BYTES + PAGE_SIZE - 1u) / PAGE_SIZE)

#define TX_COUNT       4u
#define TX_BYTES       2048u
#define TX_PAGES       TX_COUNT
#define TX_OWN         (1u << 13)
#define TX_TOK         (1u << 15)
#define TX_TUN         (1u << 14)

#define RCR_APM        (1u << 1)
#define RCR_AM         (1u << 2)
#define RCR_AB         (1u << 3)
#define RCR_WRAP       (1u << 7)

static uint16_t io_base;
static uint8_t mac_address[6];
static phys_addr_t rx_phys;
static uint8_t *rx_buffer;
static uint32_t rx_offset;
static phys_addr_t tx_phys;
static uint8_t *tx_buffer[TX_COUNT];
static uint32_t tx_index;
static int ready;

static uint8_t reg8(uint16_t offset) { return inb((uint16_t)(io_base + offset)); }
static uint32_t reg32(uint16_t offset) { return inl((uint16_t)(io_base + offset)); }
static void put8(uint16_t offset, uint8_t value) { outb((uint16_t)(io_base + offset), value); }
static void put16(uint16_t offset, uint16_t value) { outw((uint16_t)(io_base + offset), value); }
static void put32(uint16_t offset, uint32_t value) { outl((uint16_t)(io_base + offset), value); }

static void release_dma(void)
{
    if (rx_phys)
        pmm_free_contiguous(rx_phys, RX_PAGES);
    if (tx_phys)
        pmm_free_contiguous(tx_phys, TX_PAGES);
    rx_phys = 0;
    tx_phys = 0;
    rx_buffer = NULL;
    for (uint32_t i = 0; i < TX_COUNT; i++)
        tx_buffer[i] = NULL;
}

static int wait_reset(void)
{
    uint64_t deadline = timer_ms() + 100u;

    while (reg8(RTL_COMMAND) & CMD_RESET) {
        if (timer_ms() >= deadline)
            return -1;
    }
    return 0;
}

static int tx_available(uint32_t slot)
{
    uint64_t deadline = timer_ms() + 250u;

    while (!(reg32((uint16_t)(RTL_TSD0 + slot * 4u)) & TX_OWN)) {
        if (timer_ms() >= deadline)
            return -1;
    }
    return 0;
}

static uint16_t ring16(uint32_t offset)
{
    uint32_t a = offset % RX_SIZE;
    uint32_t b = (a + 1u) % RX_SIZE;
    return (uint16_t)(rx_buffer[a] | ((uint16_t)rx_buffer[b] << 8));
}

static void ring_copy(void *out, uint32_t offset, uint32_t length)
{
    uint8_t *dst = (uint8_t *)out;

    for (uint32_t i = 0; i < length; i++)
        dst[i] = rx_buffer[(offset + i) % RX_SIZE];
}

int rtl8139_init(void)
{
    struct pci_device device;
    uint32_t bar;

    ready = 0;
    io_base = 0;
    release_dma();
    rx_offset = 0;
    tx_index = 0;
    memset(mac_address, 0, sizeof(mac_address));

    if (pci_find_device(RTL8139_VENDOR_ID, RTL8139_DEVICE_ID, &device) < 0)
        return -1;

    bar = device.bar[0];
    if (!(bar & 1u))
        return -2;                 /* first implementation uses I/O BARs */
    io_base = (uint16_t)(bar & ~3u);
    if (!io_base)
        return -2;

    if (pci_enable_busmaster(&device) < 0)
        return -3;

    rx_phys = pmm_alloc_frames(RX_PAGES);
    tx_phys = pmm_alloc_frames(TX_PAGES);
    if (!rx_phys || !tx_phys) {
        release_dma();
        return -4;
    }
    rx_buffer = (uint8_t *)(uintptr_t)rx_phys;
    memset(rx_buffer, 0, RX_PAGES * PAGE_SIZE);
    memset((void *)(uintptr_t)tx_phys, 0, TX_PAGES * PAGE_SIZE);
    for (uint32_t i = 0; i < TX_COUNT; i++)
        tx_buffer[i] = (uint8_t *)(uintptr_t)(tx_phys + i * PAGE_SIZE);

    /* Wake the controller and perform a software reset. */
    put8(RTL_CONFIG1, 0x00);
    put8(RTL_COMMAND, CMD_RESET);
    if (wait_reset() < 0) {
        release_dma();
        return -5;
    }

    for (uint32_t i = 0; i < 6; i++)
        mac_address[i] = reg8((uint16_t)(RTL_IDR0 + i));

    put32(RTL_RBSTART, rx_phys);
    for (uint32_t i = 0; i < TX_COUNT; i++)
        put32((uint16_t)(RTL_TSAD0 + i * 4u), tx_phys + i * PAGE_SIZE);

    /* Polling driver: mask all device interrupts. Clear any stale causes. */
    put16(RTL_IMR, 0x0000);
    put16(RTL_ISR, 0xFFFF);

    /* Accept frames addressed to this MAC, multicast and broadcast. Do not use
     * accept-all/promiscuous mode in the browser-facing build. */
    put32(RTL_RCR, RCR_APM | RCR_AM | RCR_AB | RCR_WRAP);
    put32(RTL_TCR, 0x03000700u);
    put8(RTL_COMMAND, CMD_RX_ENABLE | CMD_TX_ENABLE);

    ready = 1;
    return 0;
}

int rtl8139_ready(void)
{
    return ready;
}

uint16_t rtl8139_io_base(void)
{
    return ready ? io_base : 0;
}

const uint8_t *rtl8139_mac(void)
{
    return ready ? mac_address : NULL;
}

int rtl8139_send(const void *frame, size_t length)
{
    uint32_t slot;
    uint32_t status;

    if (!ready || !frame || length < 14 || length > 1514 || length > TX_BYTES)
        return -1;

    slot = tx_index % TX_COUNT;
    if (tx_available(slot) < 0)
        return -2;

    memcpy(tx_buffer[slot], frame, length);
    put32((uint16_t)(RTL_TSD0 + slot * 4u), (uint32_t)length);

    {
        uint64_t deadline = timer_ms() + 500u;
        do {
            status = reg32((uint16_t)(RTL_TSD0 + slot * 4u));
            if (status & TX_TOK)
                break;
            if (status & TX_TUN)
                return -3;
        } while (timer_ms() < deadline);
        if (!(status & TX_TOK))
            return -4;
    }

    tx_index = (slot + 1u) % TX_COUNT;
    return (int)length;
}

int rtl8139_poll(void *frame, size_t capacity)
{
    uint16_t status;
    uint16_t packet_length;
    uint32_t payload_length;
    uint32_t next;

    if (!ready || !frame || capacity == 0)
        return -1;
    if (reg8(RTL_COMMAND) & CMD_RX_EMPTY)
        return 0;

    status = ring16(rx_offset);
    packet_length = ring16(rx_offset + 2u);

    /* RTL8139 length includes the four-byte Ethernet CRC. */
    if (!(status & RX_ROK) || packet_length < 4u || packet_length > 1522u) {
        rx_offset = 0;
        put16(RTL_CAPR, (uint16_t)(RX_SIZE - 16u));
        put16(RTL_ISR, 0xFFFF);
        return -2;
    }

    payload_length = (uint32_t)packet_length - 4u;
    if (payload_length > capacity)
        payload_length = (uint32_t)capacity;
    ring_copy(frame, rx_offset + 4u, payload_length);

    next = (rx_offset + 4u + packet_length + 3u) & ~3u;
    rx_offset = next % RX_SIZE;
    put16(RTL_CAPR, (uint16_t)((rx_offset - 16u) & 0xFFFFu));
    put16(RTL_ISR, 0xFFFF);
    return (int)payload_length;
}
