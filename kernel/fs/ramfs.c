/*
 * ramfs: file contents live in heap buffers that grow as they are written.
 *
 * The VFS owns the directory tree; this backend only cares about bytes.
 */
#include <kernel/fs.h>
#include <kernel/mm.h>
#include <kernel/string.h>
#include <kernel/kprintf.h>

#define RAMFS_MAX_FILE (4u * MB)

struct ramfs_data {
    uint8_t *bytes;
    size_t   capacity;
};

static int ramfs_create(struct fs_node *node)
{
    struct ramfs_data *data;

    if (node->type != FS_FILE) {
        node->backend = NULL;
        return 0;
    }

    data = (struct ramfs_data *)kcalloc(1, sizeof(*data));
    if (!data)
        return -1;
    node->backend = data;
    return 0;
}

static void ramfs_destroy(struct fs_node *node)
{
    struct ramfs_data *data = (struct ramfs_data *)node->backend;

    if (!data)
        return;
    kfree(data->bytes);
    kfree(data);
    node->backend = NULL;
}

static int ensure_capacity(struct ramfs_data *data, size_t needed)
{
    size_t   capacity;
    uint8_t *bytes;

    if (needed <= data->capacity)
        return 0;
    if (needed > RAMFS_MAX_FILE)
        return -1;

    capacity = data->capacity ? data->capacity : 64;
    while (capacity < needed)
        capacity *= 2;

    bytes = (uint8_t *)krealloc(data->bytes, capacity);
    if (!bytes)
        return -1;

    memset(bytes + data->capacity, 0, capacity - data->capacity);
    data->bytes = bytes;
    data->capacity = capacity;
    return 0;
}

static ssize_t ramfs_read(struct fs_node *node, size_t offset, void *buf, size_t len)
{
    struct ramfs_data *data = (struct ramfs_data *)node->backend;

    if (!data || offset >= node->size)
        return 0;
    if (offset + len > node->size)
        len = node->size - offset;
    memcpy(buf, data->bytes + offset, len);
    return (ssize_t)len;
}

static ssize_t ramfs_write(struct fs_node *node, size_t offset, const void *buf, size_t len)
{
    struct ramfs_data *data = (struct ramfs_data *)node->backend;

    if (!data)
        return -1;
    if (ensure_capacity(data, offset + len) < 0)
        return -1;

    memcpy(data->bytes + offset, buf, len);
    if (offset + len > node->size)
        node->size = offset + len;
    return (ssize_t)len;
}

static int ramfs_truncate(struct fs_node *node, size_t length)
{
    struct ramfs_data *data = (struct ramfs_data *)node->backend;

    if (!data)
        return -1;
    if (length > node->size && ensure_capacity(data, length) < 0)
        return -1;
    if (length > node->size)
        memset(data->bytes + node->size, 0, length - node->size);
    node->size = length;
    return 0;
}

static const struct fs_ops ops = {
    .read     = ramfs_read,
    .write    = ramfs_write,
    .truncate = ramfs_truncate,
    .create   = ramfs_create,
    .destroy  = ramfs_destroy,
};

const struct fs_ops *ramfs_ops(void)
{
    return &ops;
}
