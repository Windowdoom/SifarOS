#ifndef _KERNEL_RTC_H
#define _KERNEL_RTC_H

#include <kernel/types.h>

struct rtc_time {
    uint8_t  second;
    uint8_t  minute;
    uint8_t  hour;
    uint8_t  day;
    uint8_t  month;
    uint8_t  year;          /* two digit, as the CMOS reports it */
    uint16_t full_year;
};

void rtc_read(struct rtc_time *out);

#endif
