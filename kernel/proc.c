/*
 * User process loading.
 *
 * A program image is a flat binary linked to run at USER_BASE.  Loading one
 * means allocating frames, mapping them with the user bit set, copying the
 * image in, and then never touching those pages from ring 0 again except
 * through the checked syscall paths.
 */
#include <kernel/proc.h>
#include <kernel/mm.h>
#include <kernel/sched.h>
#include <kernel/kprintf.h>
#include <kernel/string.h>
#include <kernel/io.h>
#include <arch/x86.h>
#include <sys/syscall.h>

#define USER_STACK_PAGES 4

extern void enter_usermode(uint32_t entry, uint32_t user_stack) __attribute__((noreturn));

struct load_request {
    const uint8_t *image;
    size_t         size;
};

static struct load_request pending;
static virt_addr_t mapped[64];
static int         mapped_count;
static int         active;

static void unmap_all(void)
{
    for (int i = 0; i < mapped_count; i++) {
        phys_addr_t phys = vmm_translate(mapped[i]);

        vmm_unmap(mapped[i]);
        if (phys)
            pmm_free_frame(phys & ~0xFFFu);
    }
    mapped_count = 0;
}

static int map_user_page(virt_addr_t virt)
{
    phys_addr_t frame;

    if (mapped_count >= (int)ARRAY_SIZE(mapped))
        return -1;

    frame = pmm_alloc_frame();
    if (!frame)
        return -1;
    memset((void *)frame, 0, PAGE_SIZE);

    if (vmm_map(virt, frame, PTE_PRESENT | PTE_WRITE | PTE_USER) < 0) {
        pmm_free_frame(frame);
        return -1;
    }
    mapped[mapped_count++] = virt;
    return 0;
}

/* Runs as the new thread: build the address space, then leave ring 0. */
static void user_thread(void *arg)
{
    struct load_request *req = (struct load_request *)arg;
    size_t pages = (req->size + PAGE_SIZE - 1) / PAGE_SIZE;

    if (req->size > USER_MAX_IMAGE) {
        kprintf("proc: image too large (%u bytes)\n", (uint32_t)req->size);
        thread_exit(-1);
    }

    for (size_t i = 0; i < pages; i++) {
        if (map_user_page(USER_BASE + i * PAGE_SIZE) < 0) {
            kprintf("proc: out of memory mapping the program text\n");
            thread_exit(-1);
        }
    }
    memcpy((void *)USER_BASE, req->image, req->size);

    for (int i = 1; i <= USER_STACK_PAGES; i++) {
        if (map_user_page(USER_STACK_TOP - (uint32_t)i * PAGE_SIZE) < 0) {
            kprintf("proc: out of memory mapping the user stack\n");
            thread_exit(-1);
        }
    }

    /* Interrupts taken in ring 3 have to land on this thread's stack. */
    {
        struct thread *self = thread_current();

        self->user = 1;
        tss_set_kernel_stack(self->stack_base + self->stack_size);
    }

    enter_usermode(USER_BASE, USER_STACK_TOP - 16);
}

int proc_spawn(const char *name, const uint8_t *image, size_t size)
{
    int tid;

    if (active)
        return -1;

    pending.image = image;
    pending.size  = size;

    tid = thread_create(name, user_thread, &pending);
    if (tid < 0)
        return -1;

    active = 1;
    return tid;
}

int proc_wait(int tid)
{
    int code = thread_join(tid);

    unmap_all();
    active = 0;
    return code;
}

int proc_active(void)
{
    return active;
}
