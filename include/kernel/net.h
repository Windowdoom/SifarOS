#ifndef _KERNEL_NET_H
#define _KERNEL_NET_H

#include <kernel/types.h>

#define NET_HOST_MAX 128u
#define NET_PATH_MAX 512u
#define NET_HTTP_MAX (64u * 1024u)

struct net_info {
    uint32_t ready;
    uint8_t  mac[6];
    uint8_t  ipv4[4];
    uint8_t  gateway[4];
    uint8_t  dns[4];
};

/* SifarOS 2.0 v1 uses QEMU user networking's private 10.0.2.0/24 network.
 * This is intentionally explicit until DHCP is implemented. */
int  net_init(void);
int  net_ready(void);
void net_get_info(struct net_info *out);

/* Synchronous, bounded HTTP/1.0 transport for the native browser. Only plain
 * HTTP is implemented here. HTTPS is not downgraded or reimplemented with
 * custom cryptography; it remains unavailable until a vetted TLS library is
 * integrated. Returns response byte count or a negative error. */
int net_http_get(const char *host, uint16_t port, const char *path,
                 void *out, size_t capacity);

#endif
