#ifndef _SYS_NET_H
#define _SYS_NET_H

/*
 * User/kernel network ABI.
 *
 * The first SifarOS network surface is intentionally narrow. Applications do
 * not receive raw NIC access or arbitrary sockets. A process with the network
 * capability may query link configuration and issue one bounded HTTP/1.0 GET
 * transaction through the kernel service. HTTPS is not silently downgraded.
 */
#define NET_HOST_MAX 128u
#define NET_PATH_MAX 512u
#define NET_HTTP_MAX (64u * 1024u)

struct net_info {
    unsigned int  ready;
    unsigned char mac[6];
    unsigned char ipv4[4];
    unsigned char gateway[4];
    unsigned char dns[4];
};

struct net_http_request {
    unsigned short port;
    unsigned short reserved;
    char           host[NET_HOST_MAX];
    char           path[NET_PATH_MAX];
};

#endif
