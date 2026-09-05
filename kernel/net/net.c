/*
 * Minimal synchronous IPv4 network service for SifarOS 2.0.
 *
 * The first browser-facing stack is deliberately small enough to audit:
 * Ethernet, ARP, IPv4, UDP/DNS, one TCP connection and HTTP/1.0. It targets
 * QEMU user networking's private 10.0.2.0/24 environment. There is no TLS in
 * this module and no home-grown cryptography.
 */
#include <kernel/net.h>
#include <kernel/rtl8139.h>
#include <kernel/string.h>
#include <kernel/kprintf.h>
#include <kernel/io.h>
#include <kernel/sched.h>
#include <arch/x86.h>

#define ETH_ARP 0x0806u
#define ETH_IPV4 0x0800u
#define IP_PROTO_UDP 17u
#define IP_PROTO_TCP 6u

#define TCP_FIN 0x01u
#define TCP_SYN 0x02u
#define TCP_RST 0x04u
#define TCP_PSH 0x08u
#define TCP_ACK 0x10u

#define FRAME_MAX 1600u
#define DNS_MAX   512u
#define TCP_MSS   1200u
#define ARP_CACHE 8u

#define IP4(a,b,c,d) (((uint32_t)(a) << 24) | ((uint32_t)(b) << 16) | \
                      ((uint32_t)(c) << 8) | (uint32_t)(d))

static const uint32_t local_ip = IP4(10,0,2,15);
static const uint32_t netmask  = IP4(255,255,255,0);
static const uint32_t gateway  = IP4(10,0,2,2);
static const uint32_t dns_ip   = IP4(10,0,2,3);

struct arp_entry {
    uint32_t ip;
    uint8_t mac[6];
    uint64_t seen_ms;
};

static struct arp_entry arp_cache[ARP_CACHE];
static uint16_t ip_id = 1;
static uint16_t ephemeral = 49152u;
static uint16_t dns_id = 1;
static int initialized;
static int busy;

static uint16_t rd16(const uint8_t *p)
{
    return (uint16_t)(((uint16_t)p[0] << 8) | p[1]);
}

static uint32_t rd32(const uint8_t *p)
{
    return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) |
           ((uint32_t)p[2] << 8) | p[3];
}

static void wr16(uint8_t *p, uint16_t value)
{
    p[0] = (uint8_t)(value >> 8);
    p[1] = (uint8_t)value;
}

static void wr32(uint8_t *p, uint32_t value)
{
    p[0] = (uint8_t)(value >> 24);
    p[1] = (uint8_t)(value >> 16);
    p[2] = (uint8_t)(value >> 8);
    p[3] = (uint8_t)value;
}

static uint32_t checksum_add(uint32_t sum, const uint8_t *data, size_t length)
{
    while (length >= 2) {
        sum += ((uint32_t)data[0] << 8) | data[1];
        data += 2;
        length -= 2;
    }
    if (length)
        sum += (uint32_t)data[0] << 8;
    return sum;
}

static uint16_t checksum_finish(uint32_t sum)
{
    while (sum >> 16)
        sum = (sum & 0xFFFFu) + (sum >> 16);
    return (uint16_t)~sum;
}

static uint16_t checksum(const uint8_t *data, size_t length)
{
    return checksum_finish(checksum_add(0, data, length));
}

static void eth_header(uint8_t *frame, const uint8_t dst[6], uint16_t type)
{
    const uint8_t *mac = rtl8139_mac();

    memcpy(frame, dst, 6);
    memcpy(frame + 6, mac, 6);
    wr16(frame + 12, type);
}

static void arp_remember(uint32_t ip, const uint8_t mac[6])
{
    uint32_t slot = 0;
    uint64_t oldest = (uint64_t)-1;

    for (uint32_t i = 0; i < ARP_CACHE; i++) {
        if (arp_cache[i].ip == ip) {
            memcpy(arp_cache[i].mac, mac, 6);
            arp_cache[i].seen_ms = timer_ms();
            return;
        }
        if (!arp_cache[i].ip) {
            slot = i;
            oldest = 0;
            break;
        }
        if (arp_cache[i].seen_ms < oldest) {
            oldest = arp_cache[i].seen_ms;
            slot = i;
        }
    }
    arp_cache[slot].ip = ip;
    memcpy(arp_cache[slot].mac, mac, 6);
    arp_cache[slot].seen_ms = timer_ms();
}

static int arp_lookup(uint32_t ip, uint8_t mac[6])
{
    uint64_t now = timer_ms();

    for (uint32_t i = 0; i < ARP_CACHE; i++) {
        if (arp_cache[i].ip == ip && now - arp_cache[i].seen_ms < 60000u) {
            memcpy(mac, arp_cache[i].mac, 6);
            return 0;
        }
    }
    return -1;
}

static int send_arp(uint16_t opcode, const uint8_t dst_mac[6], uint32_t target_ip,
                    const uint8_t target_mac[6])
{
    uint8_t frame[42];
    const uint8_t *mac = rtl8139_mac();

    eth_header(frame, dst_mac, ETH_ARP);
    wr16(frame + 14, 1);             /* Ethernet */
    wr16(frame + 16, ETH_IPV4);
    frame[18] = 6;
    frame[19] = 4;
    wr16(frame + 20, opcode);
    memcpy(frame + 22, mac, 6);
    wr32(frame + 28, local_ip);
    memcpy(frame + 32, target_mac, 6);
    wr32(frame + 38, target_ip);
    return rtl8139_send(frame, sizeof(frame));
}

static void handle_arp(const uint8_t *frame, size_t length)
{
    uint16_t opcode;
    uint32_t sender_ip;
    uint32_t target_ip;

    if (length < 42 || rd16(frame + 14) != 1 || rd16(frame + 16) != ETH_IPV4 ||
        frame[18] != 6 || frame[19] != 4)
        return;

    opcode = rd16(frame + 20);
    sender_ip = rd32(frame + 28);
    target_ip = rd32(frame + 38);
    arp_remember(sender_ip, frame + 22);

    if (opcode == 1 && target_ip == local_ip)
        (void)send_arp(2, frame + 22, sender_ip, frame + 22);
}

static int poll_frame(uint8_t *frame, size_t capacity)
{
    int length = rtl8139_poll(frame, capacity);

    if (length > 0 && (size_t)length >= 14 && rd16(frame + 12) == ETH_ARP)
        handle_arp(frame, (size_t)length);
    return length;
}

static int resolve_mac(uint32_t destination, uint8_t mac[6])
{
    static const uint8_t broadcast[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
    static const uint8_t zero[6] = {0,0,0,0,0,0};
    uint32_t next_hop = ((destination & netmask) == (local_ip & netmask)) ?
                        destination : gateway;
    uint8_t frame[FRAME_MAX];

    if (arp_lookup(next_hop, mac) == 0)
        return 0;

    for (int attempt = 0; attempt < 3; attempt++) {
        uint64_t deadline;

        if (send_arp(1, broadcast, next_hop, zero) < 0)
            return -1;
        deadline = timer_ms() + 1000u;
        while (timer_ms() < deadline) {
            int length = poll_frame(frame, sizeof(frame));
            if (length < 0)
                return -1;
            if (arp_lookup(next_hop, mac) == 0)
                return 0;
            thread_sleep_ms(1);
        }
    }
    return -1;
}

static size_t build_ipv4(uint8_t *packet, uint16_t payload_length,
                         uint8_t protocol, uint32_t destination)
{
    uint16_t total = (uint16_t)(20u + payload_length);

    memset(packet, 0, 20);
    packet[0] = 0x45;
    wr16(packet + 2, total);
    wr16(packet + 4, ip_id++);
    wr16(packet + 6, 0x4000u);       /* don't fragment */
    packet[8] = 64;
    packet[9] = protocol;
    wr32(packet + 12, local_ip);
    wr32(packet + 16, destination);
    wr16(packet + 10, checksum(packet, 20));
    return 20;
}

static int send_ipv4(uint32_t destination, uint8_t protocol,
                     const void *payload, size_t payload_length)
{
    uint8_t frame[FRAME_MAX];
    uint8_t dst_mac[6];
    size_t length;

    if (payload_length > FRAME_MAX - 14u - 20u || payload_length > 0xFFFFu - 20u)
        return -1;
    if (resolve_mac(destination, dst_mac) < 0)
        return -2;

    eth_header(frame, dst_mac, ETH_IPV4);
    build_ipv4(frame + 14, (uint16_t)payload_length, protocol, destination);
    memcpy(frame + 34, payload, payload_length);
    length = 34u + payload_length;
    return rtl8139_send(frame, length);
}

static int ipv4_payload(const uint8_t *frame, size_t length, uint8_t protocol,
                        uint32_t source, const uint8_t **payload, size_t *payload_len)
{
    const uint8_t *ip;
    uint32_t ihl;
    uint16_t total;

    if (length < 34 || rd16(frame + 12) != ETH_IPV4)
        return 0;
    ip = frame + 14;
    if ((ip[0] >> 4) != 4)
        return 0;
    ihl = (uint32_t)(ip[0] & 0x0Fu) * 4u;
    if (ihl < 20 || 14u + ihl > length)
        return 0;
    total = rd16(ip + 2);
    if (total < ihl || 14u + total > length)
        return 0;
    if ((rd16(ip + 6) & 0x3FFFu) != 0)
        return 0;                       /* no fragment reassembly yet */
    if (checksum(ip, ihl) != 0)
        return 0;
    if (ip[9] != protocol || rd32(ip + 16) != local_ip)
        return 0;
    if (source && rd32(ip + 12) != source)
        return 0;

    *payload = ip + ihl;
    *payload_len = total - ihl;
    return 1;
}

static uint16_t next_port(void)
{
    ephemeral++;
    if (ephemeral < 49152u || ephemeral > 62000u)
        ephemeral = 49152u;
    return ephemeral;
}

static int send_udp(uint32_t destination, uint16_t src_port, uint16_t dst_port,
                    const void *payload, size_t payload_length)
{
    uint8_t udp[8 + DNS_MAX];
    size_t length = 8u + payload_length;

    if (payload_length > DNS_MAX)
        return -1;
    wr16(udp, src_port);
    wr16(udp + 2, dst_port);
    wr16(udp + 4, (uint16_t)length);
    wr16(udp + 6, 0);                   /* legal for IPv4 UDP */
    memcpy(udp + 8, payload, payload_length);
    return send_ipv4(destination, IP_PROTO_UDP, udp, length);
}

static int wait_udp(uint32_t source, uint16_t src_port, uint16_t dst_port,
                    void *out, size_t capacity, uint32_t timeout_ms)
{
    uint8_t frame[FRAME_MAX];
    uint64_t deadline = timer_ms() + timeout_ms;

    while (timer_ms() < deadline) {
        int length = poll_frame(frame, sizeof(frame));
        const uint8_t *udp;
        size_t udp_len;

        if (length < 0)
            return -1;
        if (length > 0 && ipv4_payload(frame, (size_t)length, IP_PROTO_UDP,
                                       source, &udp, &udp_len)) {
            uint16_t declared;
            size_t bytes;

            if (udp_len < 8 || rd16(udp) != src_port || rd16(udp + 2) != dst_port)
                goto again;
            declared = rd16(udp + 4);
            if (declared < 8 || declared > udp_len)
                goto again;
            bytes = declared - 8u;
            if (bytes > capacity)
                bytes = capacity;
            memcpy(out, udp + 8, bytes);
            return (int)bytes;
        }
again:
        thread_sleep_ms(1);
    }
    return -2;
}

static int parse_numeric_ip(const char *text, uint32_t *out)
{
    uint32_t parts[4] = {0,0,0,0};
    int part = 0;
    int digits = 0;

    if (!text || !*text)
        return -1;
    for (const char *p = text; ; p++) {
        char c = *p;
        if (c >= '0' && c <= '9') {
            parts[part] = parts[part] * 10u + (uint32_t)(c - '0');
            if (parts[part] > 255u)
                return -1;
            digits++;
        } else if (c == '.' || c == '\0') {
            if (!digits)
                return -1;
            if (c == '\0') {
                if (part != 3)
                    return -1;
                *out = IP4(parts[0], parts[1], parts[2], parts[3]);
                return 0;
            }
            if (part >= 3)
                return -1;
            part++;
            digits = 0;
        } else {
            return -1;
        }
    }
}

static int dns_name_write(uint8_t *out, size_t capacity, const char *host)
{
    size_t offset = 0;
    const char *label = host;

    if (!host || !*host)
        return -1;
    for (;;) {
        const char *end = label;
        size_t length;

        while (*end && *end != '.')
            end++;
        length = (size_t)(end - label);
        if (!length || length > 63 || offset + 1u + length + 1u > capacity)
            return -1;
        out[offset++] = (uint8_t)length;
        memcpy(out + offset, label, length);
        offset += length;
        if (!*end)
            break;
        label = end + 1;
    }
    out[offset++] = 0;
    return (int)offset;
}

static int dns_skip_name(const uint8_t *packet, size_t length, size_t *offset)
{
    size_t p = *offset;
    size_t steps = 0;

    while (p < length && steps++ < 128) {
        uint8_t n = packet[p++];
        if (n == 0) {
            *offset = p;
            return 0;
        }
        if ((n & 0xC0u) == 0xC0u) {
            if (p >= length)
                return -1;
            p++;
            *offset = p;
            return 0;
        }
        if (n > 63 || p + n > length)
            return -1;
        p += n;
    }
    return -1;
}

static int dns_resolve(const char *host, uint32_t *result)
{
    uint8_t query[DNS_MAX];
    uint8_t reply[DNS_MAX];
    uint16_t id = dns_id++;
    uint16_t port = next_port();
    int name_len;
    int received;
    size_t offset;
    uint16_t qd, an;

    if (parse_numeric_ip(host, result) == 0)
        return 0;

    memset(query, 0, sizeof(query));
    wr16(query, id);
    wr16(query + 2, 0x0100u);          /* recursion desired */
    wr16(query + 4, 1);
    name_len = dns_name_write(query + 12, sizeof(query) - 16u, host);
    if (name_len < 0)
        return -1;
    offset = 12u + (size_t)name_len;
    wr16(query + offset, 1);           /* A */
    wr16(query + offset + 2, 1);       /* IN */
    offset += 4;

    for (int attempt = 0; attempt < 3; attempt++) {
        if (send_udp(dns_ip, port, 53, query, offset) < 0)
            continue;
        received = wait_udp(dns_ip, 53, port, reply, sizeof(reply), 2000u);
        if (received < 12)
            continue;
        if (rd16(reply) != id || !(rd16(reply + 2) & 0x8000u) ||
            (rd16(reply + 2) & 0x000Fu) != 0)
            continue;

        qd = rd16(reply + 4);
        an = rd16(reply + 6);
        offset = 12;
        for (uint16_t i = 0; i < qd; i++) {
            if (dns_skip_name(reply, (size_t)received, &offset) < 0 ||
                offset + 4u > (size_t)received)
                return -1;
            offset += 4;
        }
        for (uint16_t i = 0; i < an; i++) {
            uint16_t type, klass, rdlen;
            if (dns_skip_name(reply, (size_t)received, &offset) < 0 ||
                offset + 10u > (size_t)received)
                return -1;
            type = rd16(reply + offset);
            klass = rd16(reply + offset + 2);
            rdlen = rd16(reply + offset + 8);
            offset += 10;
            if (offset + rdlen > (size_t)received)
                return -1;
            if (type == 1 && klass == 1 && rdlen == 4) {
                *result = rd32(reply + offset);
                return 0;
            }
            offset += rdlen;
        }
    }
    return -2;
}

static uint16_t tcp_checksum(uint32_t destination, const uint8_t *tcp, size_t length)
{
    uint8_t pseudo[12];
    uint32_t sum;

    wr32(pseudo, local_ip);
    wr32(pseudo + 4, destination);
    pseudo[8] = 0;
    pseudo[9] = IP_PROTO_TCP;
    wr16(pseudo + 10, (uint16_t)length);
    sum = checksum_add(0, pseudo, sizeof(pseudo));
    sum = checksum_add(sum, tcp, length);
    return checksum_finish(sum);
}

static int send_tcp(uint32_t destination, uint16_t src_port, uint16_t dst_port,
                    uint32_t seq, uint32_t ack, uint8_t flags,
                    const void *payload, size_t payload_length)
{
    uint8_t segment[20 + TCP_MSS];
    size_t length = 20u + payload_length;

    if (payload_length > TCP_MSS)
        return -1;
    memset(segment, 0, 20);
    wr16(segment, src_port);
    wr16(segment + 2, dst_port);
    wr32(segment + 4, seq);
    wr32(segment + 8, ack);
    segment[12] = 5u << 4;
    segment[13] = flags;
    wr16(segment + 14, 32768u);
    if (payload_length)
        memcpy(segment + 20, payload, payload_length);
    wr16(segment + 16, tcp_checksum(destination, segment, length));
    return send_ipv4(destination, IP_PROTO_TCP, segment, length);
}

struct tcp_packet {
    uint32_t seq;
    uint32_t ack;
    uint8_t flags;
    size_t payload_length;
    uint8_t payload[TCP_MSS + 256u];
};

static int wait_tcp(uint32_t source, uint16_t src_port, uint16_t dst_port,
                    struct tcp_packet *packet, uint32_t timeout_ms)
{
    uint8_t frame[FRAME_MAX];
    uint64_t deadline = timer_ms() + timeout_ms;

    while (timer_ms() < deadline) {
        int length = poll_frame(frame, sizeof(frame));
        const uint8_t *tcp;
        size_t tcp_len;

        if (length < 0)
            return -1;
        if (length > 0 && ipv4_payload(frame, (size_t)length, IP_PROTO_TCP,
                                       source, &tcp, &tcp_len)) {
            uint32_t header_len;
            size_t bytes;

            if (tcp_len < 20 || rd16(tcp) != src_port || rd16(tcp + 2) != dst_port)
                goto again;
            header_len = (uint32_t)(tcp[12] >> 4) * 4u;
            if (header_len < 20 || header_len > tcp_len)
                goto again;
            packet->seq = rd32(tcp + 4);
            packet->ack = rd32(tcp + 8);
            packet->flags = tcp[13];
            bytes = tcp_len - header_len;
            if (bytes > sizeof(packet->payload))
                bytes = sizeof(packet->payload);
            if (bytes)
                memcpy(packet->payload, tcp + header_len, bytes);
            packet->payload_length = bytes;
            return 1;
        }
again:
        thread_sleep_ms(1);
    }
    return 0;
}

static int http_transaction(uint32_t remote, uint16_t port, const char *host,
                            const char *path, uint8_t *out, size_t capacity)
{
    char request[1024];
    struct tcp_packet packet;
    uint16_t local_port = next_port();
    uint32_t local_seq = (uint32_t)timer_ms() * 1103515245u + 12345u;
    uint32_t remote_seq = 0;
    int request_len;
    size_t copied = 0;
    int connected = 0;

    for (int attempt = 0; attempt < 3 && !connected; attempt++) {
        if (send_tcp(remote, local_port, port, local_seq, 0, TCP_SYN, NULL, 0) < 0)
            continue;
        for (;;) {
            int got = wait_tcp(remote, port, local_port, &packet, 2000u);
            if (got <= 0)
                break;
            if ((packet.flags & (TCP_SYN | TCP_ACK)) == (TCP_SYN | TCP_ACK) &&
                packet.ack == local_seq + 1u) {
                remote_seq = packet.seq + 1u;
                local_seq++;
                if (send_tcp(remote, local_port, port, local_seq, remote_seq,
                             TCP_ACK, NULL, 0) < 0)
                    return -3;
                connected = 1;
                break;
            }
            if (packet.flags & TCP_RST)
                return -4;
        }
    }
    if (!connected)
        return -5;

    request_len = ksnprintf(request, sizeof(request),
                            "GET %s HTTP/1.0\r\nHost: %s\r\n"
                            "User-Agent: SifarExplorer/2.0\r\n"
                            "Accept: text/html,text/plain,*/*\r\n"
                            "Connection: close\r\n\r\n",
                            path && *path ? path : "/", host);
    if (request_len <= 0 || (size_t)request_len >= sizeof(request))
        return -6;

    /* HTTP request is small enough for one segment by construction. */
    if ((size_t)request_len > TCP_MSS)
        return -6;
    if (send_tcp(remote, local_port, port, local_seq, remote_seq,
                 TCP_ACK | TCP_PSH, request, (size_t)request_len) < 0)
        return -7;
    local_seq += (uint32_t)request_len;

    {
        uint64_t idle_deadline = timer_ms() + 8000u;
        for (;;) {
            int got = wait_tcp(remote, port, local_port, &packet, 1500u);

            if (got < 0)
                return -8;
            if (got == 0) {
                if (timer_ms() >= idle_deadline)
                    break;
                continue;
            }
            if (packet.flags & TCP_RST)
                break;

            if (packet.payload_length) {
                if (packet.seq == remote_seq) {
                    size_t take = packet.payload_length;
                    remote_seq += (uint32_t)packet.payload_length;
                    idle_deadline = timer_ms() + 8000u;
                    if (take > capacity - copied)
                        take = capacity - copied;
                    if (take) {
                        memcpy(out + copied, packet.payload, take);
                        copied += take;
                    }
                }
                (void)send_tcp(remote, local_port, port, local_seq, remote_seq,
                               TCP_ACK, NULL, 0);
            }

            if (packet.flags & TCP_FIN) {
                if (packet.seq + (uint32_t)packet.payload_length == remote_seq)
                    remote_seq++;
                (void)send_tcp(remote, local_port, port, local_seq, remote_seq,
                               TCP_ACK, NULL, 0);
                break;
            }
        }
    }

    return copied ? (int)copied : -9;
}

int net_init(void)
{
    memset(arp_cache, 0, sizeof(arp_cache));
    initialized = rtl8139_ready();
    busy = 0;
    return initialized ? 0 : -1;
}

int net_ready(void)
{
    return initialized && rtl8139_ready();
}

void net_get_info(struct net_info *out)
{
    const uint8_t *mac;

    if (!out)
        return;
    memset(out, 0, sizeof(*out));
    out->ready = net_ready() ? 1u : 0u;
    if (!out->ready)
        return;
    mac = rtl8139_mac();
    memcpy(out->mac, mac, 6);
    wr32(out->ipv4, local_ip);
    wr32(out->gateway, gateway);
    wr32(out->dns, dns_ip);
}

int net_http_get(const char *host, uint16_t port, const char *path,
                 void *out, size_t capacity)
{
    uint32_t remote;
    uint32_t flags;
    int result;

    if (!net_ready() || !host || !*host || !path || !out || capacity == 0 ||
        capacity > NET_HTTP_MAX || port == 0)
        return -1;

    flags = irq_save();
    if (busy) {
        irq_restore(flags);
        return -2;
    }
    busy = 1;
    irq_restore(flags);

    result = dns_resolve(host, &remote);
    if (result == 0)
        result = http_transaction(remote, port, host, path,
                                  (uint8_t *)out, capacity);

    flags = irq_save();
    busy = 0;
    irq_restore(flags);
    return result;
}
