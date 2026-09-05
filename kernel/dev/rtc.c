/*
 * MC146818 real time clock, read through the CMOS index/data port pair.
 */
#include <kernel/rtc.h>
#include <kernel/io.h>

#define CMOS_INDEX 0x70
#define CMOS_DATA  0x71

static uint8_t cmos_read(uint8_t reg)
{
    outb(CMOS_INDEX, reg);
    io_wait();
    return inb(CMOS_DATA);
}

static int update_in_progress(void)
{
    return cmos_read(0x0A) & 0x80;
}

static uint8_t from_bcd(uint8_t value)
{
    return (uint8_t)((value & 0x0F) + ((value >> 4) * 10));
}

void rtc_read(struct rtc_time *out)
{
    struct rtc_time first;
    uint8_t status_b;
    int guard = 1000000;

    while (update_in_progress() && guard--)
        ;

    first.second = cmos_read(0x00);
    first.minute = cmos_read(0x02);
    first.hour   = cmos_read(0x04);
    first.day    = cmos_read(0x07);
    first.month  = cmos_read(0x08);
    first.year   = cmos_read(0x09);

    /* Read again until two passes agree, so we never catch a half update. */
    for (int attempt = 0; attempt < 8; attempt++) {
        struct rtc_time again;

        while (update_in_progress())
            ;
        again.second = cmos_read(0x00);
        again.minute = cmos_read(0x02);
        again.hour   = cmos_read(0x04);
        again.day    = cmos_read(0x07);
        again.month  = cmos_read(0x08);
        again.year   = cmos_read(0x09);

        if (again.second == first.second && again.minute == first.minute &&
            again.hour == first.hour && again.day == first.day &&
            again.month == first.month && again.year == first.year)
            break;
        first = again;
    }

    status_b = cmos_read(0x0B);

    if (!(status_b & 0x04)) {       /* values are BCD encoded */
        int pm = first.hour & 0x80;

        first.second = from_bcd(first.second);
        first.minute = from_bcd(first.minute);
        first.hour   = from_bcd((uint8_t)(first.hour & 0x7F));
        first.day    = from_bcd(first.day);
        first.month  = from_bcd(first.month);
        first.year   = from_bcd(first.year);
        if (pm)
            first.hour = (uint8_t)((first.hour % 12) + 12);
    }

    if (!(status_b & 0x02) && (first.hour & 0x80)) {    /* 12 hour clock */
        first.hour = (uint8_t)(((first.hour & 0x7F) % 12) + 12);
    }

    out->second = first.second;
    out->minute = first.minute;
    out->hour   = first.hour;
    out->day    = first.day;
    out->month  = first.month;
    out->year   = first.year;
    out->full_year = (uint16_t)(2000 + first.year);
}
