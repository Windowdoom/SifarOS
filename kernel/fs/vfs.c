/*
 * Virtual filesystem.
 *
 * Owns the directory tree and all path handling; the actual bytes are stored
 * by whichever backend a node was created with (today that is always ramfs).
 */
#include <kernel/fs.h>
#include <kernel/mm.h>
#include <kernel/string.h>
#include <kernel/kprintf.h>
#include <arch/x86.h>

static struct fs_node *root;
static uint32_t        node_count;

struct fs_node *vfs_root(void)
{
    return root;
}

uint32_t vfs_node_count(void)
{
    return node_count;
}

static uint64_t sum_bytes(const struct fs_node *node)
{
    uint64_t total = node->size;

    for (const struct fs_node *c = node->first_child; c; c = c->next_sibling)
        total += sum_bytes(c);
    return total;
}

uint64_t vfs_bytes_used(void)
{
    return root ? sum_bytes(root) : 0;
}

static struct fs_node *node_alloc(const char *name, uint8_t type,
                                  const struct fs_ops *ops)
{
    struct fs_node *node = (struct fs_node *)kcalloc(1, sizeof(*node));

    if (!node)
        return NULL;

    strlcpy(node->name, name, FS_NAME_MAX);
    node->type = type;
    node->ops = ops ? ops : ramfs_ops();
    node->created_ms = timer_ms();
    node->modified_ms = node->created_ms;

    node_count++;
    return node;
}

/* Build a node that a filesystem driver already has storage for. */
struct fs_node *vfs_node_new(const char *name, uint8_t type,
                             const struct fs_ops *ops, void *backend, size_t size)
{
    struct fs_node *node = node_alloc(name, type, ops);

    if (!node)
        return NULL;
    node->backend = backend;
    node->size = size;
    return node;
}

static struct fs_node *find_child(struct fs_node *dir, const char *name, size_t len)
{
    if (!dir || dir->type != FS_DIR)
        return NULL;

    for (struct fs_node *c = dir->first_child; c; c = c->next_sibling) {
        if (strlen(c->name) == len && strncmp(c->name, name, len) == 0)
            return c;
    }
    return NULL;
}

static void link_child(struct fs_node *dir, struct fs_node *child)
{
    struct fs_node **slot = &dir->first_child;

    /* Keep siblings sorted so directory listings are stable. */
    while (*slot && strcmp((*slot)->name, child->name) < 0)
        slot = &(*slot)->next_sibling;

    child->next_sibling = *slot;
    *slot = child;
    child->parent = dir;
}

static void unlink_child(struct fs_node *dir, struct fs_node *child)
{
    struct fs_node **slot = &dir->first_child;

    while (*slot) {
        if (*slot == child) {
            *slot = child->next_sibling;
            child->next_sibling = NULL;
            child->parent = NULL;
            return;
        }
        slot = &(*slot)->next_sibling;
    }
}

/*
 * Turn any mix of absolute/relative path plus "." and ".." into a clean
 * absolute path.  Purely textual: it does not touch the tree.
 */
int vfs_abspath(const char *cwd, const char *path, char *out, size_t size)
{
    char   stack[FS_PATH_MAX];
    size_t len = 0;
    const char *p;

    if (size < 2)
        return -1;

    stack[0] = '\0';

    if (path[0] != '/' && cwd && cwd[0]) {
        len = strlcpy(stack, cwd, sizeof(stack));
        if (len >= sizeof(stack))
            return -1;
        if (len > 1 && stack[len - 1] == '/')
            stack[--len] = '\0';
    }

    for (p = path; *p; ) {
        const char *start;
        size_t seg;

        while (*p == '/')
            p++;
        if (!*p)
            break;

        start = p;
        while (*p && *p != '/')
            p++;
        seg = (size_t)(p - start);

        if (seg == 1 && start[0] == '.')
            continue;

        if (seg == 2 && start[0] == '.' && start[1] == '.') {
            char *slash = strrchr(stack, '/');
            if (slash)
                *slash = '\0';
            len = strlen(stack);
            continue;
        }

        if (len + 1 + seg >= sizeof(stack))
            return -1;
        stack[len++] = '/';
        memcpy(stack + len, start, seg);
        len += seg;
        stack[len] = '\0';
    }

    if (stack[0] == '\0')
        strlcpy(stack, "/", sizeof(stack));

    if (strlcpy(out, stack, size) >= size)
        return -1;
    return 0;
}

struct fs_node *vfs_lookup(const char *cwd, const char *path)
{
    char  absolute[FS_PATH_MAX];
    struct fs_node *node = root;
    const char *p;

    if (vfs_abspath(cwd, path, absolute, sizeof(absolute)) < 0)
        return NULL;

    for (p = absolute; *p; ) {
        const char *start;
        size_t seg;

        while (*p == '/')
            p++;
        if (!*p)
            break;

        start = p;
        while (*p && *p != '/')
            p++;
        seg = (size_t)(p - start);

        node = find_child(node, start, seg);
        if (!node)
            return NULL;
    }
    return node;
}

int vfs_path_of(const struct fs_node *node, char *out, size_t size)
{
    const struct fs_node *chain[32];
    int depth = 0;
    size_t len = 0;

    if (!node || size == 0)
        return -1;

    while (node && node->parent && depth < (int)ARRAY_SIZE(chain)) {
        chain[depth++] = node;
        node = node->parent;
    }

    if (depth == 0) {
        strlcpy(out, "/", size);
        return 0;
    }

    out[0] = '\0';
    for (int i = depth - 1; i >= 0; i--) {
        size_t seg = strlen(chain[i]->name);

        if (len + 1 + seg >= size)
            return -1;
        out[len++] = '/';
        memcpy(out + len, chain[i]->name, seg);
        len += seg;
        out[len] = '\0';
    }
    return 0;
}

struct fs_node *vfs_create(const char *cwd, const char *path, uint8_t type)
{
    char  absolute[FS_PATH_MAX];
    char *slash;
    struct fs_node *parent;
    struct fs_node *node;

    if (vfs_abspath(cwd, path, absolute, sizeof(absolute)) < 0)
        return NULL;
    if (strcmp(absolute, "/") == 0)
        return NULL;

    slash = strrchr(absolute, '/');
    *slash = '\0';
    parent = vfs_lookup(NULL, absolute[0] ? absolute : "/");
    if (!parent || parent->type != FS_DIR)
        return NULL;

    if (find_child(parent, slash + 1, strlen(slash + 1)))
        return NULL;                /* already exists */
    if (strlen(slash + 1) >= FS_NAME_MAX)
        return NULL;

    /* New nodes belong to the same filesystem as the directory holding them. */
    node = node_alloc(slash + 1, type, parent->ops);
    if (!node)
        return NULL;

    link_child(parent, node);

    if (node->ops->create && node->ops->create(node) < 0) {
        unlink_child(parent, node);
        kfree(node);
        node_count--;
        return NULL;
    }
    return node;
}

void vfs_attach(struct fs_node *parent, struct fs_node *child)
{
    link_child(parent, child);
}

void vfs_set_root(struct fs_node *node)
{
    root = node;
    node->parent = NULL;
}

/*
 * Release a subtree.  Backends are told about each node while it is still
 * linked to its parent, because an on-disk filesystem needs the parent
 * directory in order to remove the entry.
 */
static void destroy_tree(struct fs_node *node)
{
    struct fs_node *child = node->first_child;

    while (child) {
        struct fs_node *next = child->next_sibling;

        destroy_tree(child);
        child = next;
    }

    if (node->ops && node->ops->destroy)
        node->ops->destroy(node);
    if (node->parent)
        unlink_child(node->parent, node);
    kfree(node);
    node_count--;
}

int vfs_unlink(const char *cwd, const char *path)
{
    struct fs_node *node = vfs_lookup(cwd, path);

    if (!node || node == root)
        return -1;
    if (node->readonly)
        return -2;

    destroy_tree(node);
    return 0;
}

ssize_t vfs_read(struct fs_node *node, size_t offset, void *buf, size_t len)
{
    if (!node || node->type != FS_FILE || !node->ops || !node->ops->read)
        return -1;
    return node->ops->read(node, offset, buf, len);
}

ssize_t vfs_write(struct fs_node *node, size_t offset, const void *buf, size_t len)
{
    ssize_t written;

    if (!node || node->type != FS_FILE || !node->ops || !node->ops->write)
        return -1;
    if (node->readonly)
        return -2;

    written = node->ops->write(node, offset, buf, len);
    if (written > 0)
        node->modified_ms = timer_ms();
    return written;
}

int vfs_truncate(struct fs_node *node, size_t length)
{
    if (!node || node->type != FS_FILE || !node->ops || !node->ops->truncate)
        return -1;
    if (node->readonly)
        return -2;
    return node->ops->truncate(node, length);
}

int vfs_write_file(const char *path, const void *data, size_t len)
{
    struct fs_node *node = vfs_lookup(NULL, path);

    if (!node)
        node = vfs_create(NULL, path, FS_FILE);
    if (!node)
        return -1;
    if (vfs_truncate(node, 0) < 0)
        return -1;
    return (vfs_write(node, 0, data, len) == (ssize_t)len) ? 0 : -1;
}

int vfs_append_file(const char *path, const void *data, size_t len)
{
    struct fs_node *node = vfs_lookup(NULL, path);

    if (!node)
        node = vfs_create(NULL, path, FS_FILE);
    if (!node)
        return -1;
    return (vfs_write(node, node->size, data, len) == (ssize_t)len) ? 0 : -1;
}

ssize_t vfs_read_file(const char *path, void *buf, size_t len)
{
    struct fs_node *node = vfs_lookup(NULL, path);

    if (!node)
        return -1;
    return vfs_read(node, 0, buf, len);
}

void vfs_init(void)
{
    root = node_alloc("", FS_DIR, ramfs_ops());
    if (!root)
        panic("vfs: cannot allocate root directory");
    if (root->ops->create)
        root->ops->create(root);
    root->parent = NULL;
}
