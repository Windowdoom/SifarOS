/*
 * ATA (IDE) driver, PIO mode, primary bus master drive.
 *
 * Polled rather than interrupt driven. Early boot runs before scheduler/IRQ
 * timekeeping is live, so waits use a conservative bounded spin budget then.
 * Once scheduling is active they use a real millisecond timeout and yield
 * periodically instead of monopolising the CPU.
 */
#include <kernel/blockdev.h>
#include <kernel/kprintf.h>
#include <kernel/string.h>
#include <kernel/io.h>
#include <kernel/sched.h>
#include <arch/x86.h>

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

#define ATA_TIMEOUT_MS        3000u
#define ATA_EARLY_SPIN_LIMIT  4000000u
#define ATA_YIELD_INTERVAL    1024u

static struct blockdev device;
static char            model[41];
static int             present;

static void delay400(void)
{
    for (int i = 0; i < 4; i++)
        (void)inb(ATA_CONTROL);
}

/* Return 0 when the requested state arrives, -1 for controller error and -2
 * for timeout. `need_drq` selects whether READY alone is sufficient. */
static int wait_status(int need_drq)
{
    uint64_t started = timer_ms();
    uint32_t spins = 0;

    for (;;) {
        uint8_t status = inb(ATA_STATUS);

        if (status & (STATUS_ERR | STATUS_DF))
            return -1;
        if (!(status & STATUS_BUSY)) {
            if (status & STATUS_DRQ)
                return 0;
            if (!need_drq && (status & STATUS_READY))
                return 0;
        }

        spins++;
        if (sched_enabled()) {
            if (timer_ms() - started >= ATA_TIMEOUT_MS)
                return -2;
            if ((spins % ATA_YIELD_INTERVAL) == 0)
                sched_yield();
        } else {
            /* Timer interrupts are not enabled during ATA discovery, so a
             * wall-clock timeout cannot advance yet. Keep early boot bounded. */
            if (spins >= ATA_EARLY_SPIN_LIMIT)
                return -2;
            if ((spins % ATA_YIELD_INTERVAL) == 0)
                io_wait();
        }
    }
}

static int wait_ready(void)
{
    return wait_status(0);
}

static int wait_drq(void)
{
    return wait_status(1);
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

static int request_in_range(const struct blockdev *dev, uint32_t lba, uint32_t count)
{
    if (!dev || !count || lba >= dev->sectors)
        return 0;
    return count <= dev->sectors - lba;
}

static int ata_read_sectors(struct blockdev *dev, uint32_t lba, uint32_t count, void *buffer)
{
    uint16_t *out = (uint16_t *)buffer;

    if (!present || !buffer || !request_in_range(dev, lba, count))
        return -1;

    while (count) {
        uint32_t chunk = (count > 255) ? 255 : count;

        if (wait_ready() < 0)
            return -1;
        select_lba(lba, (uint8_t)chunk);
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

    if (!present || !buffer || !request_in_range(dev, lba, count))
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
    present = device.sectors != 0;

    return present ? 0 : -1;
}
