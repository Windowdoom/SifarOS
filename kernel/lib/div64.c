/*
 * 64-bit division helpers.
 *
 * A 32-bit compiler turns "uint64_t / uint64_t" into a call to libgcc.  We
 * link without libgcc, so the handful of helpers we actually need live here,
 * implemented with plain shift-and-subtract long division.
 */
#include <kernel/types.h>

uint64_t __udivmoddi4(uint64_t num, uint64_t den, uint64_t *rem)
{
    uint64_t quotient = 0;
    uint64_t remainder = 0;

    if (den == 0) {
        /* Match the hardware: dividing by zero is a fault we cannot raise
           here, so return the saturated value instead of corrupting state. */
        if (rem)
            *rem = 0;
        return ~0ull;
    }

    for (int bit = 63; bit >= 0; bit--) {
        remainder = (remainder << 1) | ((num >> bit) & 1ull);
        if (remainder >= den) {
            remainder -= den;
            quotient |= 1ull << bit;
        }
    }

    if (rem)
        *rem = remainder;
    return quotient;
}

uint64_t __udivdi3(uint64_t num, uint64_t den)
{
    return __udivmoddi4(num, den, NULL);
}

uint64_t __umoddi3(uint64_t num, uint64_t den)
{
    uint64_t rem;

    __udivmoddi4(num, den, &rem);
    return rem;
}

int64_t __divdi3(int64_t num, int64_t den)
{
    int negative = 0;
    uint64_t q;

    if (num < 0) { num = -num; negative ^= 1; }
    if (den < 0) { den = -den; negative ^= 1; }

    q = __udivmoddi4((uint64_t)num, (uint64_t)den, NULL);
    return negative ? -(int64_t)q : (int64_t)q;
}

int64_t __moddi3(int64_t num, int64_t den)
{
    int negative = (num < 0);
    uint64_t r;

    if (num < 0) num = -num;
    if (den < 0) den = -den;

    __udivmoddi4((uint64_t)num, (uint64_t)den, &r);
    return negative ? -(int64_t)r : (int64_t)r;
}
