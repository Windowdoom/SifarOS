#ifndef _KERNEL_BLOCKDEV_H
#define _KERNEL_BLOCKDEV_H

#include <kernel/types.h>

#define SECTOR_SIZE 512

/* A block device is anything that can move 512 byte sectors around. */
struct blockdev {
    const char *name;
    uint32_t    sectors;                /* total capacity */
    int (*read)(struct blockdev *dev, uint32_t lba, uint32_t count, void *buffer);
    int (*write)(struct blockdev *dev, uint32_t lba, uint32_t count, const void *buffer);
    void       *context;
};

int              ata_init(void);
struct blockdev *ata_device(void);
const char      *ata_model(void);

#endif
