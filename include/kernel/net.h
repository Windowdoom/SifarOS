#ifndef _KERNEL_NET_H
#define _KERNEL_NET_H

#include <kernel/types.h>
#include <sys/net.h>

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
