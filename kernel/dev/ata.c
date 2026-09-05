/*
 * ATA (IDE) driver, PIO mode, primary bus master drive.
 *
 * Polled rather than interrupt driven: the disk is only touched by the
 * filesystem, always from a thread that can afford to wait, and polling keeps
 * the driver small enough to reason about.
 */
#include <kernel/blockdev.h>
#include <kernel/kprintf.h>
#include <kernel/string.h>
#include <kernel/io.h>

#define ATA_DATA        0x1F0
#define ATA_ERROR       0x1F1
#define ATA_SECCOUNT    0x1F2
#define ATA_LBA_LOW     0x1F3
#define ATA_LBA_MID     0x1F4
#define ATA_LBA_HIGH    0x1F5
#define ATA_DRIVE       0x1F6
#define ATA_STATUS      0x1F7
#define ATA_COMMAND     0x1F7
#define ATA_CONTROL     0x3F6

#define STATUS_ERR      0x01
#define STATUS_DRQ      0x08
#define STATUS_SRV      0x10
#define STATUS_DF       0x20
#define STATUS_READY    0x40
#define STATUS_BUSY     0x80

#define CMD_READ_PIO    0x20
#define CMD_WRITE_PIO   0x30
#define CMD_FLUSH       0xE7
#define CMD_IDENTIFY    0xEC

static struct blockdev device;
static char            model[41];
static int             present;

static void delay400(void)
{
    for (int i = 0; i < 4; i++)
        (void)inb(ATA_CONTROL);
}

static int wait_ready(void)
{
    for (int spin = 0; spin < 4000000; spin++) {
        uint8_t status = inb(ATA_STATUS);

        if (status & STATUS_BUSY)
            continue;
        if (status & (STATUS_ERR | STATUS_DF))
            return -1;
        if (status & STATUS_DRQ)
            return 0;
        if (status & STATUS_READY)
            return 0;
    }
    return -1;
}

static int wait_drq(void)
{
    for (int spin = 0; spin < 4000000; spin++) {
        uint8_t status = inb(ATA_STATUS);

        if (status & (STATUS_ERR | STATUS_DF))
            return -1;
        if (!(status & STATUS_BUSY) && (status & STATUS_DRQ))
            return 0;
    }
    return -1;
}

/* Select the drive and program an LBA28 request. */
static void select_lba(uint32_t lba, uint8_t count)
{
    outb(ATA_DRIVE, (uint8_t)(0xE0 | ((lba >> 24) & 0x0F)));
    outb(ATA_ERROR, 0x00);
    outb(ATA_SECCOUNT, count);
    outb(ATA_LBA_LOW, (uint8_t)(lba & 0xFF));
    outb(ATA_LBA_MID, (uint8_t)((lba >> 8) & 0xFF));
    outb(ATA_LBA_HIGH, (uint8_t)((lba >> 16) & 0xFF));
}

static int ata_read_sectors(struct blockdev *dev, uint32_t lba, uint32_t count, void *buffer)
{
    uint16_t *out = (uint16_t *)buffer;

    (void)dev;
    if (!present || count == 0)
        return -1;

    while (count) {
        uint32_t chunk = (count > 255) ? 255 : count;

        if (wait_ready() < 0)
            return -1;
        select_lba(lba, (uint8_t)(chunk == 256 ? 0 : chunk));
        outb(ATA_COMMAND, CMD_READ_PIO);
        delay400();

        for (uint32_t sector = 0; sector < chunk; sector++) {
            if (wait_drq() < 0)
                return -1;
            for (int word = 0; word < SECTOR_SIZE / 2; word++)
                *out++ = inw(ATA_DATA);
            delay400();
        }

        lba += chunk;
        count -= chunk;
    }
    return 0;
}

static int ata_write_sectors(struct blockdev *dev, uint32_t lba, uint32_t count,
                             const void *buffer)
{
    const uint16_t *in = (const uint16_t *)buffer;

    (void)dev;
    if (!present || count == 0)
        return -1;

    while (count) {
        uint32_t chunk = (count > 255) ? 255 : count;

        if (wait_ready() < 0)
            return -1;
        select_lba(lba, (uint8_t)chunk);
        outb(ATA_COMMAND, CMD_WRITE_PIO);
        delay400();

        for (uint32_t sector = 0; sector < chunk; sector++) {
            if (wait_drq() < 0)
                return -1;
            for (int word = 0; word < SECTOR_SIZE / 2; word++)
                outw(ATA_DATA, *in++);
            delay400();
        }

        if (wait_ready() < 0)
            return -1;
        outb(ATA_COMMAND, CMD_FLUSH);
        if (wait_ready() < 0)
            return -1;

        lba += chunk;
        count -= chunk;
    }
    return 0;
}

struct blockdev *ata_device(void)
{
    return present ? &device : NULL;
}

const char *ata_model(void)
{
    return present ? model : "none";
}

int ata_init(void)
{
    uint16_t identify[256];
    uint8_t  status;

    outb(ATA_CONTROL, 0x02);            /* interrupts off, we poll */

    outb(ATA_DRIVE, 0xA0);              /* master */
    delay400();
    outb(ATA_SECCOUNT, 0);
    outb(ATA_LBA_LOW, 0);
    outb(ATA_LBA_MID, 0);
    outb(ATA_LBA_HIGH, 0);
    outb(ATA_COMMAND, CMD_IDENTIFY);
    delay400();

    status = inb(ATA_STATUS);
    if (status == 0)
        return -1;                      /* nothing on this bus */

    if (wait_drq() < 0)
        return -1;

    for (int i = 0; i < 256; i++)
        identify[i] = inw(ATA_DATA);

    /* Words 27..46 hold the model string, byte swapped. */
    for (int i = 0; i < 20; i++) {
        model[i * 2]     = (char)(identify[27 + i] >> 8);
        model[i * 2 + 1] = (char)(identify[27 + i] & 0xFF);
    }
    model[40] = '\0';
    for (int i = 39; i >= 0 && (model[i] == ' ' || model[i] == '\0'); i--)
        model[i] = '\0';

    device.name    = "ata0";
    device.sectors = ((uint32_t)identify[61] << 16) | identify[60];
    device.read    = ata_read_sectors;
    device.write   = ata_write_sectors;
    device.context = NULL;
    present = 1;

    return 0;
}
