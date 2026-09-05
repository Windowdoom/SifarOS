#ifndef _KERNEL_SFS_H
#define _KERNEL_SFS_H

#include <kernel/types.h>
#include <kernel/blockdev.h>
#include <kernel/fs.h>

/*
 * SifarFS on-disk layout (all little endian, 4 KiB blocks):
 *
 *   block 0            superblock
 *   bitmap_start..     one bit per block, set means allocated
 *   inode_start..      flat inode table, 32 inodes per block
 *   data_start..       file and directory contents
 *
 * tools/mkfs.py writes exactly this layout.
 */
#define SFS_MAGIC        0x53465321u    /* "SFS!" */
#define SFS_VERSION      1
#define SFS_BLOCK        4096u
#define SFS_INODE_SIZE   128u
#define SFS_INODES_PER_BLOCK (SFS_BLOCK / SFS_INODE_SIZE)
#define SFS_DIRECT       12
#define SFS_POINTERS     (SFS_BLOCK / 4)
#define SFS_NAME_MAX     56
#define SFS_DIRENT_SIZE  64
#define SFS_ROOT_INODE   1

/* Where the filesystem starts on the boot disk (see the Makefile). */
#define SFS_PARTITION_LBA 2048u

#define SFS_TYPE_FREE 0
#define SFS_TYPE_FILE 1
#define SFS_TYPE_DIR  2

#define SFS_FLAG_READONLY 1
#define SFS_FLAG_EXEC     2

struct sfs_super {
    uint32_t magic;
    uint32_t version;
    uint32_t block_size;
    uint32_t total_blocks;
    uint32_t bitmap_start;
    uint32_t bitmap_blocks;
    uint32_t inode_start;
    uint32_t inode_blocks;
    uint32_t inode_count;
    uint32_t root_inode;
    uint32_t free_blocks;
    char     label[32];
} PACKED;

struct sfs_inode {
    uint32_t type;
    uint32_t size;
    uint32_t links;
    uint32_t created;
    uint32_t modified;
    uint32_t flags;
    uint32_t direct[SFS_DIRECT];
    uint32_t indirect;
    uint32_t reserved[13];
} PACKED;

struct sfs_dirent {
    uint32_t inode;
    uint32_t name_len;
    char     name[SFS_NAME_MAX];
} PACKED;

/* Mount the filesystem that starts at `start_lba` and graft it onto the VFS. */
int  sfs_mount(struct blockdev *dev, uint32_t start_lba);
int  sfs_mounted(void);
void sfs_stats(uint64_t *total_bytes, uint64_t *free_bytes, uint32_t *inodes_used);
const char *sfs_label(void);
const struct fs_ops *sfs_ops(void);

#endif
