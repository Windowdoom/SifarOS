/*
 * SifarFS: the native on-disk filesystem.
 *
 * Contents live on the disk; the directory structure is read into VFS nodes
 * at mount time and kept in step as files are created and removed. Writes go
 * straight through to the disk. All on-disk metadata is untrusted and must be
 * validated before it can select a heap size, inode, block or device LBA.
 */
#include <kernel/sfs.h>
#include <kernel/mm.h>
#include <kernel/string.h>
#include <kernel/kprintf.h>
#include <arch/x86.h>
#include <kernel/io.h>

static struct blockdev *device;
static uint32_t         partition_lba;
static uint32_t         volume_blocks;
static uint32_t         data_start;
static struct sfs_super super;
static uint8_t         *bitmap;
static size_t           bitmap_bytes;
static int              mounted;
static uint32_t         inodes_used;

#define SECTORS_PER_BLOCK (SFS_BLOCK / SECTOR_SIZE)
#define INODE_OF(node) ((uint32_t)(uintptr_t)(node)->backend)
#define SFS_MAX_FILE_SIZE ((uint32_t)((SFS_DIRECT + SFS_POINTERS) * SFS_BLOCK))

static int read_block(uint32_t block, void *buffer)
{
    uint64_t lba;
    uint32_t limit;

    if (!device || !buffer)
        return -1;
    limit = mounted ? super.total_blocks : volume_blocks;
    if (block >= limit)
        return -1;
    lba = (uint64_t)partition_lba + (uint64_t)block * SECTORS_PER_BLOCK;
    if (lba > device->sectors || SECTORS_PER_BLOCK > (uint64_t)device->sectors - lba)
        return -1;
    return device->read(device, (uint32_t)lba, SECTORS_PER_BLOCK, buffer);
}

static int write_block(uint32_t block, const void *buffer)
{
    uint64_t lba;
    uint32_t limit;

    if (!device || !buffer)
        return -1;
    limit = mounted ? super.total_blocks : volume_blocks;
    if (block >= limit)
        return -1;
    lba = (uint64_t)partition_lba + (uint64_t)block * SECTORS_PER_BLOCK;
    if (lba > device->sectors || SECTORS_PER_BLOCK > (uint64_t)device->sectors - lba)
        return -1;
    return device->write(device, (uint32_t)lba, SECTORS_PER_BLOCK, buffer);
}

/*
 * A block is 4 KiB, which is far too much to put on a kernel stack that also
 * has to absorb interrupts. These scratch buffers come from the heap and are
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

    return (uint8_t *)kmalloc(SFS_BLOCK);
}

static void scratch_give(uint8_t *buffer)
{
    uint32_t flags;

    if (!buffer)
        return;
    flags = irq_save();
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

static void scratch_destroy(void)
{
    for (int i = 0; i < SCRATCH_COUNT; i++) {
        if (scratch_pool[i])
            kfree(scratch_pool[i]);
        scratch_pool[i] = NULL;
        scratch_busy[i] = 0;
    }
}

static int mount_abort(int code)
{
    if (bitmap) {
        kfree(bitmap);
        bitmap = NULL;
    }
    bitmap_bytes = 0;
    mounted = 0;
    scratch_destroy();
    device = NULL;
    partition_lba = 0;
    volume_blocks = 0;
    data_start = 0;
    memset(&super, 0, sizeof(super));
    return code;
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

/* ------------------------------------------------------------- validation */

static int ranges_overlap(uint32_t a_start, uint32_t a_count,
                          uint32_t b_start, uint32_t b_count)
{
    uint64_t a_end = (uint64_t)a_start + a_count;
    uint64_t b_end = (uint64_t)b_start + b_count;

    return (uint64_t)a_start < b_end && (uint64_t)b_start < a_end;
}

static int validate_superblock(void)
{
    uint64_t bitmap_end;
    uint64_t inode_end;
    uint64_t bitmap_capacity;
    uint64_t required_inode_blocks;
    uint64_t bytes;

    if (super.magic != SFS_MAGIC)
        return -2;
    if (super.block_size != SFS_BLOCK || super.version != SFS_VERSION)
        return -3;
    if (!super.total_blocks || super.total_blocks > volume_blocks)
        return -4;
    if (!super.bitmap_blocks || !super.inode_blocks || !super.inode_count)
        return -4;
    if (super.bitmap_start == 0 || super.inode_start == 0)
        return -4;

    bitmap_end = (uint64_t)super.bitmap_start + super.bitmap_blocks;
    inode_end = (uint64_t)super.inode_start + super.inode_blocks;
    if (bitmap_end > super.total_blocks || inode_end > super.total_blocks)
        return -4;
    if (ranges_overlap(super.bitmap_start, super.bitmap_blocks,
                       super.inode_start, super.inode_blocks))
        return -4;

    bitmap_capacity = (uint64_t)super.bitmap_blocks * SFS_BLOCK * 8u;
    if (bitmap_capacity < super.total_blocks)
        return -4;

    required_inode_blocks = ((uint64_t)super.inode_count + SFS_INODES_PER_BLOCK - 1) /
                            SFS_INODES_PER_BLOCK;
    if (required_inode_blocks > super.inode_blocks)
        return -4;
    if (super.root_inode < 1 || super.root_inode > super.inode_count)
        return -4;

    data_start = 1;
    if (bitmap_end > data_start)
        data_start = (uint32_t)bitmap_end;
    if (inode_end > data_start)
        data_start = (uint32_t)inode_end;
    if (data_start > super.total_blocks)
        return -4;
    if (super.free_blocks > super.total_blocks - data_start)
        return -4;

    bytes = (uint64_t)super.bitmap_blocks * SFS_BLOCK;
    if (!bytes || bytes > SIZE_MAX)
        return -4;
    bitmap_bytes = (size_t)bytes;

    super.label[sizeof(super.label) - 1] = '\0';
    return 0;
}

static int valid_data_block(uint32_t block)
{
    return block >= data_start && block < super.total_blocks;
}

static int validate_inode(const struct sfs_inode *inode)
{
    if (!inode || inode->type > SFS_TYPE_DIR)
        return -1;
    if (inode->type == SFS_TYPE_FREE)
        return 0;
    if (inode->size > SFS_MAX_FILE_SIZE)
        return -1;
    for (uint32_t i = 0; i < SFS_DIRECT; i++) {
        if (inode->direct[i] && !valid_data_block(inode->direct[i]))
            return -1;
    }
    if (inode->indirect && !valid_data_block(inode->indirect))
        return -1;
    return 0;
}

static int validate_dirent(const struct sfs_dirent *entry)
{
    if (!entry)
        return 0;
    if (entry->inode == 0)
        return 1;
    if (entry->inode > super.inode_count || entry->name_len == 0 ||
        entry->name_len >= SFS_NAME_MAX)
        return 0;
    if (entry->name[entry->name_len] != '\0')
        return 0;
    for (uint32_t i = 0; i < entry->name_len; i++) {
        unsigned char c = (unsigned char)entry->name[i];
        if (c == 0 || c == '/' || c < 0x20 || c == 0x7F)
            return 0;
    }
    return 1;
}

/* ------------------------------------------------------------- allocation */

static int bitmap_test(uint32_t block)
{
    size_t byte;

    if (!bitmap || block >= super.total_blocks)
        return 1;
    byte = block / 8u;
    if (byte >= bitmap_bytes)
        return 1;
    return (bitmap[byte] >> (block % 8)) & 1;
}

static int bitmap_flush(uint32_t block)
{
    uint32_t index;

    if (block >= super.total_blocks)
        return -1;
    index = block / (SFS_BLOCK * 8);
    if (index >= super.bitmap_blocks ||
        (size_t)index * SFS_BLOCK >= bitmap_bytes)
        return -1;
    return write_block(super.bitmap_start + index, bitmap + (size_t)index * SFS_BLOCK);
}

static uint32_t alloc_block(void)
{
    for (uint32_t block = data_start; block < super.total_blocks; block++) {
        uint8_t *zeros;

        if (bitmap_test(block))
            continue;

        bitmap[block / 8] |= (uint8_t)(1u << (block % 8));
        if (bitmap_flush(block) < 0) {
            bitmap[block / 8] &= (uint8_t)~(1u << (block % 8));
            return 0;
        }
        if (super.free_blocks)
            super.free_blocks--;
        if (write_super() < 0)
            return 0;

        zeros = scratch_take();
        if (!zeros)
            return 0;
        memset(zeros, 0, SFS_BLOCK);
        if (write_block(block, zeros) < 0) {
            scratch_give(zeros);
            return 0;
        }
        scratch_give(zeros);
        return block;
    }
    return 0;
}

static void free_block(uint32_t block)
{
    if (!valid_data_block(block) || !bitmap_test(block))
        return;

    bitmap[block / 8] &= (uint8_t)~(1u << (block % 8));
    if (bitmap_flush(block) < 0) {
        bitmap[block / 8] |= (uint8_t)(1u << (block % 8));
        return;
    }
    if (super.free_blocks < super.total_blocks - data_start)
        super.free_blocks++;
    write_super();
}

static int inode_read(uint32_t number, struct sfs_inode *out)
{
    uint8_t *block;
    uint32_t index;

    if (!out || number < 1 || number > super.inode_count)
        return -1;
    index = number - 1;

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
    return validate_inode(out);
}

static int inode_write(uint32_t number, const struct sfs_inode *in)
{
    uint8_t *block;
    uint32_t index;
    uint32_t block_number;
    int result;

    if (!in || number < 1 || number > super.inode_count || validate_inode(in) < 0)
        return -1;
    index = number - 1;

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

    if (type != SFS_TYPE_FILE && type != SFS_TYPE_DIR)
        return 0;
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
    uint32_t result;

    if (!inode || index >= SFS_DIRECT + SFS_POINTERS)
        return 0;

    if (index < SFS_DIRECT) {
        result = inode->direct[index];
        if (result && !valid_data_block(result))
            return 0;
        if (!result && allocate) {
            result = alloc_block();
            if (!result)
                return 0;
            inode->direct[index] = result;
            if (changed)
                *changed = 1;
        }
        return result;
    }

    index -= SFS_DIRECT;
    if (!inode->indirect) {
        if (!allocate)
            return 0;
        inode->indirect = alloc_block();
        if (!inode->indirect)
            return 0;
        if (changed)
            *changed = 1;
    } else if (!valid_data_block(inode->indirect)) {
        return 0;
    }

    {
        uint32_t *table = (uint32_t *)scratch_take();

        if (!table)
            return 0;
        if (read_block(inode->indirect, (uint8_t *)table) < 0) {
            scratch_give((uint8_t *)table);
            return 0;
        }
        result = table[index];
        if (result && !valid_data_block(result)) {
            scratch_give((uint8_t *)table);
            return 0;
        }
        if (!result && allocate) {
            result = alloc_block();
            if (result) {
                table[index] = result;
                if (write_block(inode->indirect, (uint8_t *)table) < 0)
                    result = 0;
            }
        }
        scratch_give((uint8_t *)table);
        return result;
    }
}

static ssize_t sfs_file_read(uint32_t number, size_t offset, void *buffer, size_t length)
{
    struct sfs_inode inode;
    uint8_t *block;
    uint8_t *out = (uint8_t *)buffer;
    size_t copied = 0;

    if (!buffer && length)
        return -1;
    if (inode_read(number, &inode) < 0 || inode.type == SFS_TYPE_FREE)
        return -1;
    if (offset >= inode.size)
        return 0;
    if (length > inode.size - offset)
        length = inode.size - offset;

    block = scratch_take();
    if (!block)
        return -1;

    while (copied < length) {
        uint32_t index = (uint32_t)((offset + copied) / SFS_BLOCK);
        uint32_t within = (uint32_t)((offset + copied) % SFS_BLOCK);
        uint32_t disk_block = block_for(&inode, index, 0, NULL);
        size_t chunk = SFS_BLOCK - within;

        if (chunk > length - copied)
            chunk = length - copied;

        if (disk_block) {
            if (read_block(disk_block, block) < 0) {
                scratch_give(block);
                return copied ? (ssize_t)copied : -1;
            }
            memcpy(out + copied, block + within, chunk);
        } else {
            memset(out + copied, 0, chunk);
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
    uint8_t *block;
    const uint8_t *in = (const uint8_t *)buffer;
    size_t written = 0;
    int inode_changed = 0;

    if (!buffer && length)
        return -1;
    if (offset > SFS_MAX_FILE_SIZE || length > SFS_MAX_FILE_SIZE - offset)
        return -1;
    if (inode_read(number, &inode) < 0 || inode.type == SFS_TYPE_FREE)
        return -1;

    block = scratch_take();
    if (!block)
        return -1;

    while (written < length) {
        uint32_t index = (uint32_t)((offset + written) / SFS_BLOCK);
        uint32_t within = (uint32_t)((offset + written) % SFS_BLOCK);
        uint32_t disk_block = block_for(&inode, index, 1, &inode_changed);
        size_t chunk = SFS_BLOCK - within;

        if (!disk_block)
            break;
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
    uint32_t total;

    if (!inode || inode->size > SFS_MAX_FILE_SIZE)
        return;
    total = (inode->size + SFS_BLOCK - 1) / SFS_BLOCK;

    for (uint32_t index = from_index; index < total; index++) {
        if (index < SFS_DIRECT) {
            free_block(inode->direct[index]);
            inode->direct[index] = 0;
        } else if (inode->indirect && valid_data_block(inode->indirect)) {
            uint32_t *table = (uint32_t *)scratch_take();
            uint32_t slot = index - SFS_DIRECT;

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

    if (length > SFS_MAX_FILE_SIZE)
        return -1;
    if (inode_read(number, &inode) < 0 || inode.type == SFS_TYPE_FREE)
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

    if (!name || strlen(name) >= SFS_NAME_MAX || child < 1 || child > super.inode_count)
        return -1;
    if (inode_read(dir_inode, &inode) < 0 || inode.type != SFS_TYPE_DIR)
        return -1;

    memset(&entry, 0, sizeof(entry));
    entry.inode = child;
    entry.name_len = (uint32_t)strlen(name);
    strlcpy(entry.name, name, SFS_NAME_MAX);

    for (offset = 0; offset < inode.size; offset += SFS_DIRENT_SIZE) {
        struct sfs_dirent existing;

        if (sfs_file_read(dir_inode, offset, &existing, sizeof(existing)) <= 0)
            break;
        if (!validate_dirent(&existing))
            return -1;
        if (existing.inode == 0)
            return sfs_file_write(dir_inode, offset, &entry, sizeof(entry)) > 0 ? 0 : -1;
    }

    return sfs_file_write(dir_inode, inode.size, &entry, sizeof(entry)) > 0 ? 0 : -1;
}

static int dir_remove(uint32_t dir_inode, const char *name)
{
    struct sfs_inode inode;

    if (!name || inode_read(dir_inode, &inode) < 0 || inode.type != SFS_TYPE_DIR)
        return -1;

    for (uint32_t offset = 0; offset < inode.size; offset += SFS_DIRENT_SIZE) {
        struct sfs_dirent entry;

        if (sfs_file_read(dir_inode, offset, &entry, sizeof(entry)) <= 0)
            break;
        if (!validate_dirent(&entry))
            return -1;
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

    if (written > 0 && offset <= SIZE_MAX - (size_t)written &&
        offset + (size_t)written > node->size)
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

    if (dir_add(INODE_OF(node->parent), node->name, number) < 0) {
        struct sfs_inode empty;

        memset(&empty, 0, sizeof(empty));
        inode_write(number, &empty);
        if (inodes_used)
            inodes_used--;
        return -1;
    }

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

    if (depth > 16 || inode_read(dir_inode, &inode) < 0 || inode.type != SFS_TYPE_DIR)
        return;

    for (uint32_t offset = 0; offset < inode.size; offset += SFS_DIRENT_SIZE) {
        struct sfs_dirent entry;
        struct sfs_inode child;
        struct fs_node *node;

        if (sfs_file_read(dir_inode, offset, &entry, sizeof(entry)) <= 0)
            break;
        if (!validate_dirent(&entry))
            break;
        if (entry.inode == 0)
            continue;
        if (inode_read(entry.inode, &child) < 0 || child.type == SFS_TYPE_FREE)
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
    struct sfs_inode root_inode;
    int validation;

    if (mounted || !dev || !dev->read || !dev->write ||
        start_lba >= dev->sectors ||
        (uint64_t)dev->sectors - start_lba < SECTORS_PER_BLOCK)
        return -1;

    device = dev;
    partition_lba = start_lba;
    volume_blocks = (dev->sectors - start_lba) / SECTORS_PER_BLOCK;
    bitmap = NULL;
    bitmap_bytes = 0;
    data_start = 0;
    memset(&super, 0, sizeof(super));

    for (int i = 0; i < SCRATCH_COUNT; i++) {
        scratch_pool[i] = (uint8_t *)kmalloc(SFS_BLOCK);
        scratch_busy[i] = 0;
        if (!scratch_pool[i])
            return mount_abort(-1);
    }

    block = scratch_take();
    if (!block || read_block(0, block) < 0) {
        scratch_give(block);
        return mount_abort(-1);
    }

    memcpy(&super, block, sizeof(super));
    scratch_give(block);

    validation = validate_superblock();
    if (validation < 0)
        return mount_abort(validation);

    bitmap = (uint8_t *)kmalloc(bitmap_bytes);
    if (!bitmap)
        return mount_abort(-5);
    for (uint32_t i = 0; i < super.bitmap_blocks; i++) {
        if (read_block(super.bitmap_start + i,
                       bitmap + (size_t)i * SFS_BLOCK) < 0)
            return mount_abort(-5);
    }

    /* Metadata blocks are never allocatable, even if a damaged bitmap claims
     * otherwise. Requiring these bits also makes a malformed image fail
     * closed instead of silently drifting into self-corruption. */
    for (uint32_t block_index = 0; block_index < data_start; block_index++) {
        if (!bitmap_test(block_index))
            return mount_abort(-6);
    }

    if (inode_read(super.root_inode, &root_inode) < 0 ||
        root_inode.type != SFS_TYPE_DIR)
        return mount_abort(-6);

    mounted = 1;
    inodes_used = 1;

    root = vfs_node_new("", FS_DIR, &ops, (void *)(uintptr_t)super.root_inode,
                        root_inode.size);
    if (!root)
        return mount_abort(-7);
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
