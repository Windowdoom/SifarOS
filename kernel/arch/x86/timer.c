/*
 * Channel 0 of the 8253/8254 PIT, used as the system tick.  The tick both
 * drives the clock and preempts the running thread.
 */
#include <arch/x86.h>
#include <kernel/io.h>
#include <kernel/sched.h>

#define PIT_CH0      0x40
#define PIT_CMD      0x43
#define PIT_FREQ     1193182u

static volatile uint64_t ticks;
static uint32_t          frequency = 100;

static void timer_irq(struct registers *regs)
{
    (void)regs;
    ticks++;
    sched_tick();
}

void timer_init(uint32_t hz)
{
    uint32_t divisor;

    if (hz == 0)
        hz = 100;
    frequency = hz;
    divisor = PIT_FREQ / hz;
    if (divisor > 0xFFFF)
        divisor = 0xFFFF;

    outb(PIT_CMD, 0x36);                            /* ch0, lo/hi, square wave */
    outb(PIT_CH0, (uint8_t)(divisor & 0xFF));
    outb(PIT_CH0, (uint8_t)((divisor >> 8) & 0xFF));

    isr_register(IRQ_BASE + IRQ_TIMER, timer_irq);
    pic_unmask_irq(IRQ_TIMER);
}

uint64_t timer_ticks(void)
{
    return ticks;
}

uint32_t timer_hz(void)
{
    return frequency;
}

uint64_t timer_ms(void)
{
    return (ticks * 1000ull) / frequency;
}

/* Spin until the requested time has passed.  Only for early boot. */
void timer_busy_wait(uint32_t ms)
{
    uint64_t target = ticks + ((uint64_t)ms * frequency) / 1000 + 1;
    while (ticks < target)
        __asm__ volatile("hlt");
}
