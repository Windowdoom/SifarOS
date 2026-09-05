/*
 * SifarFS: the native on-disk filesystem.
 *
 * Contents live on the disk; the directory structure is read into VFS nodes
 * at mount time and kept in step as files are created and removed.  Writes go
 * straight through to the disk, so pulling the power only ever loses whatever
 * was in flight.
 */
#include <kernel/sfs.h>
#include <kernel/mm.h>
#include <kernel/string.h>
#include <kernel/kprintf.h>
#include <arch/x86.h>
#include <kernel/io.h>

static struct blockdev *device;
static uint32_t         partition_lba;
static struct sfs_super super;
static uint8_t         *bitmap;
static int              mounted;
static uint32_t         inodes_used;

#define SECTORS_PER_BLOCK (SFS_BLOCK / SECTOR_SIZE)
#define INODE_OF(node) ((uint32_t)(uintptr_t)(node)->backend)

static int read_block(uint32_t block, void *buffer)
{
    return device->read(device, partition_lba + block * SECTORS_PER_BLOCK,
                        SECTORS_PER_BLOCK, buffer);
}

static int write_block(uint32_t block, const void *buffer)
{
    return device->write(device, partition_lba + block * SECTORS_PER_BLOCK,
                         SECTORS_PER_BLOCK, buffer);
}

/*
 * A block is 4 KiB, which is far too much to put on a kernel stack that also
 * has to absorb interrupts.  These scratch buffers come from the heap and are
 * handed out one at a time; the filesystem is only ever entered from a thread.
 */
#define SCRATCH_COUNT 4

static uint8_t *scratch_pool[SCRATCH_COUNT];
static uint8_t  scratch_busy[SCRATCH_COUNT];

static uint8_t *scratch_take(void)
{
    uint32_t flags = irq_save();

    for (int i = 0; i < SCRATCH_COUNT; i++) {
        if (!scratch_busy[i] && scratch_pool[i]) {
            scratch_busy[i] = 1;
            irq_restore(flags);
            return scratch_pool[i];
        }
    }
    irq_restore(flags);

    /* Every buffer is in use further up the call chain: take one from the
       heap for this call only. */
    return (uint8_t *)kmalloc(SFS_BLOCK);
}

static void scratch_give(uint8_t *buffer)
{
    uint32_t flags = irq_save();

    for (int i = 0; i < SCRATCH_COUNT; i++) {
        if (scratch_pool[i] == buffer) {
            scratch_busy[i] = 0;
            irq_restore(flags);
            return;
        }
    }
    irq_restore(flags);
    kfree(buffer);
}

static int write_super(void)
{
    uint8_t *block = scratch_take();
    int result;

    if (!block)
        return -1;
    memset(block, 0, SFS_BLOCK);
    memcpy(block, &super, sizeof(super));
    result = write_block(0, block);
    scratch_give(block);
    return result;
}

/* ------------------------------------------------------------- allocation */

static int bitmap_test(uint32_t block)
{
    return (bitmap[block / 8] >> (block % 8)) & 1;
}

static void bitmap_flush(uint32_t block)
{
    uint32_t index = block / (SFS_BLOCK * 8);

    write_block(super.bitmap_start + index, bitmap + index * SFS_BLOCK);
}

static uint32_t alloc_block(void)
{
    for (uint32_t block = 0; block < super.total_blocks; block++) {
        uint8_t *zeros;

        if (bitmap_test(block))
            continue;

        bitmap[block / 8] |= (uint8_t)(1 << (block % 8));
        bitmap_flush(block);
        if (super.free_blocks)
            super.free_blocks--;
        write_super();

        zeros = scratch_take();
        if (zeros) {
            memset(zeros, 0, SFS_BLOCK);
            write_block(block, zeros);
            scratch_give(zeros);
        }
        return block;
    }
    return 0;
}

static void free_block(uint32_t block)
{
    if (!block || block >= super.total_blocks || !bitmap_test(block))
        return;

    bitmap[block / 8] &= (uint8_t)~(1 << (block % 8));
    bitmap_flush(block);
    super.free_blocks++;
    write_super();
}

static int inode_read(uint32_t number, struct sfs_inode *out)
{
    uint8_t *block;
    uint32_t index = number - 1;

    if (number < 1 || number > super.inode_count)
        return -1;

    block = scratch_take();
    if (!block)
        return -1;
    if (read_block(super.inode_start + index / SFS_INODES_PER_BLOCK, block) < 0) {
        scratch_give(block);
        return -1;
    }

    memcpy(out, block + (index % SFS_INODES_PER_BLOCK) * SFS_INODE_SIZE,
           sizeof(*out));
    scratch_give(block);
    return 0;
}

static int inode_write(uint32_t number, const struct sfs_inode *in)
{
    uint8_t *block;
    uint32_t index = number - 1;
    uint32_t block_number;
    int      result;

    if (number < 1 || number > super.inode_count)
        return -1;

    block = scratch_take();
    if (!block)
        return -1;

    block_number = super.inode_start + index / SFS_INODES_PER_BLOCK;
    if (read_block(block_number, block) < 0) {
        scratch_give(block);
        return -1;
    }
    memcpy(block + (index % SFS_INODES_PER_BLOCK) * SFS_INODE_SIZE, in, sizeof(*in));
    result = write_block(block_number, block);
    scratch_give(block);
    return result;
}

static uint32_t alloc_inode(uint32_t type)
{
    struct sfs_inode inode;

    for (uint32_t number = 1; number <= super.inode_count; number++) {
        if (inode_read(number, &inode) < 0)
            return 0;
        if (inode.type != SFS_TYPE_FREE)
            continue;

        memset(&inode, 0, sizeof(inode));
        inode.type = type;
        inode.links = 1;
        inode.created = (uint32_t)(timer_ms() / 1000);
        inode.modified = inode.created;
        if (inode_write(number, &inode) < 0)
            return 0;
        inodes_used++;
        return number;
    }
    return 0;
}

/* ------------------------------------------------------------ file blocks */

/* Map a file-relative block index to a disk block, optionally allocating. */
static uint32_t block_for(struct sfs_inode *inode, uint32_t index, int allocate,
                          int *changed)
{
    if (index < SFS_DIRECT) {
        if (!inode->direct[index] && allocate) {
            inode->direct[index] = alloc_block();
            if (changed)
                *changed = 1;
        }
        return inode->direct[index];
    }

    index -= SFS_DIRECT;
    if (index >= SFS_POINTERS)
        return 0;

    if (!inode->indirect) {
        if (!allocate)
            return 0;
        inode->indirect = alloc_block();
        if (!inode->indirect)
            return 0;
        if (changed)
            *changed = 1;
    }

    {
        uint32_t *table = (uint32_t *)scratch_take();
        uint32_t  result;

        if (!table)
            return 0;
        if (read_block(inode->indirect, (uint8_t *)table) < 0) {
            scratch_give((uint8_t *)table);
            return 0;
        }
        if (!table[index] && allocate) {
            table[index] = alloc_block();
            if (table[index])
                write_block(inode->indirect, (uint8_t *)table);
        }
        result = table[index];
        scratch_give((uint8_t *)table);
        return result;
    }
}

static ssize_t sfs_file_read(uint32_t number, size_t offset, void *buffer, size_t length)
{
    struct sfs_inode inode;
    uint8_t         *block;
    uint8_t         *out = (uint8_t *)buffer;
    size_t           copied = 0;

    if (inode_read(number, &inode) < 0)
        return -1;
    if (offset >= inode.size)
        return 0;
    if (offset + length > inode.size)
        length = inode.size - offset;

    block = scratch_take();
    if (!block)
        return -1;

    while (copied < length) {
        uint32_t index = (uint32_t)((offset + copied) / SFS_BLOCK);
        uint32_t within = (uint32_t)((offset + copied) % SFS_BLOCK);
        uint32_t disk_block = block_for(&inode, index, 0, NULL);
        size_t   chunk = SFS_BLOCK - within;

        if (chunk > length - copied)
            chunk = length - copied;

        if (disk_block) {
            if (read_block(disk_block, block) < 0)
                break;
            memcpy(out + copied, block + within, chunk);
        } else {
            memset(out + copied, 0, chunk);     /* sparse: reads as zeroes */
        }
        copied += chunk;
    }

    scratch_give(block);
    return (ssize_t)copied;
}

static ssize_t sfs_file_write(uint32_t number, size_t offset, const void *buffer,
                              size_t length)
{
    struct sfs_inode inode;
    uint8_t         *block;
    const uint8_t   *in = (const uint8_t *)buffer;
    size_t           written = 0;
    int              inode_changed = 0;

    if (inode_read(number, &inode) < 0)
        return -1;

    block = scratch_take();
    if (!block)
        return -1;

    while (written < length) {
        uint32_t index = (uint32_t)((offset + written) / SFS_BLOCK);
        uint32_t within = (uint32_t)((offset + written) % SFS_BLOCK);
        uint32_t disk_block = block_for(&inode, index, 1, &inode_changed);
        size_t   chunk = SFS_BLOCK - within;

        if (!disk_block)
            break;                              /* out of space */
        if (chunk > length - written)
            chunk = length - written;

        if (chunk != SFS_BLOCK) {
            if (read_block(disk_block, block) < 0)
                break;
        } else {
            memset(block, 0, SFS_BLOCK);
        }
        memcpy(block + within, in + written, chunk);
        if (write_block(disk_block, block) < 0)
            break;
        written += chunk;
    }

    if (offset + written > inode.size) {
        inode.size = (uint32_t)(offset + written);
        inode_changed = 1;
    }
    inode.modified = (uint32_t)(timer_ms() / 1000);
    if (inode_changed || written)
        inode_write(number, &inode);

    scratch_give(block);
    return (ssize_t)written;
}

static void release_blocks(struct sfs_inode *inode, uint32_t from_index)
{
    uint32_t total = (inode->size + SFS_BLOCK - 1) / SFS_BLOCK;

    for (uint32_t index = from_index; index < total; index++) {
        if (index < SFS_DIRECT) {
            free_block(inode->direct[index]);
            inode->direct[index] = 0;
        } else if (inode->indirect) {
            uint32_t *table = (uint32_t *)scratch_take();
            uint32_t  slot = index - SFS_DIRECT;

            if (!table)
                break;
            if (slot >= SFS_POINTERS || read_block(inode->indirect, (uint8_t *)table) < 0) {
                scratch_give((uint8_t *)table);
                break;
            }
            free_block(table[slot]);
            table[slot] = 0;
            write_block(inode->indirect, (uint8_t *)table);
            scratch_give((uint8_t *)table);
        }
    }

    if (from_index == 0 && inode->indirect) {
        free_block(inode->indirect);
        inode->indirect = 0;
    }
}

static int sfs_file_truncate_inode(uint32_t number, size_t length)
{
    struct sfs_inode inode;

    if (inode_read(number, &inode) < 0)
        return -1;

    if (length < inode.size) {
        uint32_t keep = (uint32_t)((length + SFS_BLOCK - 1) / SFS_BLOCK);

        release_blocks(&inode, keep);
    }
    inode.size = (uint32_t)length;
    inode.modified = (uint32_t)(timer_ms() / 1000);
    return inode_write(number, &inode);
}

/* ------------------------------------------------------------ directories */

static int dir_add(uint32_t dir_inode, const char *name, uint32_t child)
{
    struct sfs_inode inode;
    struct sfs_dirent entry;
    uint32_t offset;

    if (strlen(name) >= SFS_NAME_MAX)
        return -1;
    if (inode_read(dir_inode, &inode) < 0)
        return -1;

    memset(&entry, 0, sizeof(entry));
    entry.inode = child;
    entry.name_len = (uint32_t)strlen(name);
    strlcpy(entry.name, name, SFS_NAME_MAX);

    /* Reuse a hole if the directory has one. */
    for (offset = 0; offset < inode.size; offset += SFS_DIRENT_SIZE) {
        struct sfs_dirent existing;

        if (sfs_file_read(dir_inode, offset, &existing, sizeof(existing)) <= 0)
            break;
        if (existing.inode == 0)
            return sfs_file_write(dir_inode, offset, &entry, sizeof(entry)) > 0 ? 0 : -1;
    }

    return sfs_file_write(dir_inode, inode.size, &entry, sizeof(entry)) > 0 ? 0 : -1;
}

static int dir_remove(uint32_t dir_inode, const char *name)
{
    struct sfs_inode inode;

    if (inode_read(dir_inode, &inode) < 0)
        return -1;

    for (uint32_t offset = 0; offset < inode.size; offset += SFS_DIRENT_SIZE) {
        struct sfs_dirent entry;

        if (sfs_file_read(dir_inode, offset, &entry, sizeof(entry)) <= 0)
            break;
        if (entry.inode == 0)
            continue;
        if (strcmp(entry.name, name) == 0) {
            memset(&entry, 0, sizeof(entry));
            sfs_file_write(dir_inode, offset, &entry, sizeof(entry));
            return 0;
        }
    }
    return -1;
}

/* ---------------------------------------------------------- VFS interface */

static ssize_t op_read(struct fs_node *node, size_t offset, void *buffer, size_t length)
{
    return sfs_file_read(INODE_OF(node), offset, buffer, length);
}

static ssize_t op_write(struct fs_node *node, size_t offset, const void *buffer,
                        size_t length)
{
    ssize_t written = sfs_file_write(INODE_OF(node), offset, buffer, length);

    if (written > 0 && offset + (size_t)written > node->size)
        node->size = offset + (size_t)written;
    return written;
}

static int op_truncate(struct fs_node *node, size_t length)
{
    int result = sfs_file_truncate_inode(INODE_OF(node), length);

    if (result == 0)
        node->size = length;
    return result;
}

static int op_create(struct fs_node *node)
{
    uint32_t type = (node->type == FS_DIR) ? SFS_TYPE_DIR : SFS_TYPE_FILE;
    uint32_t number;

    if (!mounted || !node->parent)
        return -1;

    number = alloc_inode(type);
    if (!number)
        return -1;

    if (dir_add(INODE_OF(node->parent), node->name, number) < 0)
        return -1;

    node->backend = (void *)(uintptr_t)number;
    node->size = 0;
    return 0;
}

static void op_destroy(struct fs_node *node)
{
    uint32_t number = INODE_OF(node);
    struct sfs_inode inode;

    if (!mounted || !number)
        return;

    if (node->parent)
        dir_remove(INODE_OF(node->parent), node->name);

    if (inode_read(number, &inode) == 0) {
        release_blocks(&inode, 0);
        memset(&inode, 0, sizeof(inode));
        inode_write(number, &inode);
        if (inodes_used)
            inodes_used--;
    }
    node->backend = NULL;
}

static const struct fs_ops ops = {
    .read     = op_read,
    .write    = op_write,
    .truncate = op_truncate,
    .create   = op_create,
    .destroy  = op_destroy,
};

const struct fs_ops *sfs_ops(void)
{
    return &ops;
}

/* ----------------------------------------------------------------- mount */

/* Walk a directory on disk and build the matching VFS nodes underneath it. */
static void build_tree(struct fs_node *parent, uint32_t dir_inode, int depth)
{
    struct sfs_inode inode;

    if (depth > 16 || inode_read(dir_inode, &inode) < 0)
        return;

    for (uint32_t offset = 0; offset < inode.size; offset += SFS_DIRENT_SIZE) {
        struct sfs_dirent entry;
        struct sfs_inode  child;
        struct fs_node   *node;

        if (sfs_file_read(dir_inode, offset, &entry, sizeof(entry)) <= 0)
            break;
        if (entry.inode == 0 || entry.name[0] == '\0')
            continue;
        if (inode_read(entry.inode, &child) < 0)
            continue;

        node = vfs_node_new(entry.name,
                            (child.type == SFS_TYPE_DIR) ? FS_DIR : FS_FILE,
                            &ops, (void *)(uintptr_t)entry.inode, child.size);
        if (!node)
            continue;
        node->readonly = (child.flags & SFS_FLAG_READONLY) ? 1 : 0;
        vfs_attach(parent, node);
        inodes_used++;

        if (child.type == SFS_TYPE_DIR)
            build_tree(node, entry.inode, depth + 1);
    }
}

int sfs_mount(struct blockdev *dev, uint32_t start_lba)
{
    uint8_t *block;
    struct fs_node *root;

    device = dev;
    partition_lba = start_lba;

    for (int i = 0; i < SCRATCH_COUNT; i++) {
        scratch_pool[i] = (uint8_t *)kmalloc(SFS_BLOCK);
        scratch_busy[i] = 0;
        if (!scratch_pool[i])
            return -1;
    }

    block = scratch_take();
    if (!dev || !block || read_block(0, block) < 0) {
        if (block)
            scratch_give(block);
        return -1;
    }

    memcpy(&super, block, sizeof(super));
    scratch_give(block);
    if (super.magic != SFS_MAGIC)
        return -2;
    if (super.block_size != SFS_BLOCK || super.version != SFS_VERSION)
        return -3;

    bitmap = (uint8_t *)kmalloc(super.bitmap_blocks * SFS_BLOCK);
    if (!bitmap)
        return -4;
    for (uint32_t i = 0; i < super.bitmap_blocks; i++) {
        if (read_block(super.bitmap_start + i, bitmap + i * SFS_BLOCK) < 0) {
            kfree(bitmap);
            bitmap = NULL;
            return -5;
        }
    }

    mounted = 1;
    inodes_used = 1;

    root = vfs_node_new("", FS_DIR, &ops, (void *)(uintptr_t)super.root_inode, 0);
    if (!root)
        return -6;
    vfs_set_root(root);
    build_tree(root, super.root_inode, 0);

    return 0;
}

int sfs_mounted(void)
{
    return mounted;
}

const char *sfs_label(void)
{
    return mounted ? super.label : "";
}

void sfs_stats(uint64_t *total_bytes, uint64_t *free_bytes, uint32_t *used_inodes)
{
    if (total_bytes)
        *total_bytes = mounted ? (uint64_t)super.total_blocks * SFS_BLOCK : 0;
    if (free_bytes)
        *free_bytes = mounted ? (uint64_t)super.free_blocks * SFS_BLOCK : 0;
    if (used_inodes)
        *used_inodes = inodes_used;
}
