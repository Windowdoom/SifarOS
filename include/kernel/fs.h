#ifndef _KERNEL_FS_H
#define _KERNEL_FS_H

#include <kernel/types.h>

#define FS_NAME_MAX 32
#define FS_PATH_MAX 192

enum fs_type {
    FS_FILE = 1,
    FS_DIR  = 2,
};

struct fs_node;

/* Operations a filesystem backend has to provide to the VFS. */
struct fs_ops {
    ssize_t (*read)(struct fs_node *node, size_t offset, void *buf, size_t len);
    ssize_t (*write)(struct fs_node *node, size_t offset, const void *buf, size_t len);
    int     (*truncate)(struct fs_node *node, size_t length);
    int     (*create)(struct fs_node *node);    /* attach backend storage */
    void    (*destroy)(struct fs_node *node);   /* release backend storage */
};

struct fs_node {
    char                 name[FS_NAME_MAX];
    uint8_t              type;
    uint8_t              readonly;
    size_t               size;
    void                *backend;               /* private to the filesystem */
    const struct fs_ops *ops;
    struct fs_node      *parent;
    struct fs_node      *first_child;
    struct fs_node      *next_sibling;
    uint64_t             created_ms;
    uint64_t             modified_ms;
};

void            vfs_init(void);
struct fs_node *vfs_root(void);

/* Path helpers.  Paths may be absolute or relative to `cwd`. */
int             vfs_abspath(const char *cwd, const char *path, char *out, size_t size);
struct fs_node *vfs_lookup(const char *cwd, const char *path);
int             vfs_path_of(const struct fs_node *node, char *out, size_t size);

struct fs_node *vfs_create(const char *cwd, const char *path, uint8_t type);
int             vfs_unlink(const char *cwd, const char *path);

ssize_t         vfs_read(struct fs_node *node, size_t offset, void *buf, size_t len);
ssize_t         vfs_write(struct fs_node *node, size_t offset, const void *buf, size_t len);
int             vfs_truncate(struct fs_node *node, size_t length);

/* Convenience wrappers used by the shell and by kernel bring-up. */
int             vfs_write_file(const char *path, const void *data, size_t len);
int             vfs_append_file(const char *path, const void *data, size_t len);
ssize_t         vfs_read_file(const char *path, void *buf, size_t len);

uint32_t        vfs_node_count(void);
uint64_t        vfs_bytes_used(void);

/* ramfs: the only filesystem implementation, entirely in memory. */
const struct fs_ops *ramfs_ops(void);

#endif
