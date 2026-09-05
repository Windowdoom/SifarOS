/*
 * In-kernel test suite.
 *
 * These run on the real hardware state of a booted system, which makes them
 * the closest thing the project has to integration tests.  tools/test.sh
 * drives them over the serial console and checks the summary line.
 */
#include <kernel/ktest.h>
#include <kernel/kprintf.h>
#include <kernel/string.h>
#include <kernel/mm.h>
#include <kernel/fs.h>
#include <kernel/sched.h>
#include <arch/x86.h>
#include <kernel/io.h>

static int checks_run;
static int checks_failed;
static const char *current_suite = "";

static void check(int condition, const char *what)
{
    checks_run++;
    if (condition) {
        kprintf("  [ ok ] %s: %s\n", current_suite, what);
    } else {
        checks_failed++;
        kprintf("  [FAIL] %s: %s\n", current_suite, what);
    }
}

static void suite(const char *name)
{
    current_suite = name;
}

/* ------------------------------------------------------------------ tests */

static void test_string(void)
{
    char buffer[32];

    suite("string");
    check(strlen("sifar") == 5, "strlen counts characters");
    check(strcmp("abc", "abc") == 0, "strcmp matches equal strings");
    check(strcmp("abc", "abd") < 0, "strcmp orders strings");
    check(strncmp("prefix-a", "prefix-b", 7) == 0, "strncmp respects the limit");

    strlcpy(buffer, "hello", sizeof(buffer));
    strcat(buffer, " world");
    check(strcmp(buffer, "hello world") == 0, "strlcpy and strcat compose");

    memset(buffer, 'x', 4);
    buffer[4] = '\0';
    check(strcmp(buffer, "xxxx") == 0, "memset fills");

    memcpy(buffer, "abcd", 4);
    check(memcmp(buffer, "abcd", 4) == 0, "memcpy and memcmp agree");

    strcpy(buffer, "0123456789");
    memmove(buffer + 2, buffer, 8);
    check(memcmp(buffer, "0101234567", 10) == 0, "memmove handles overlap");

    check(atoi("  -42") == -42, "atoi parses a negative number");
    check(strchr("path/to/file", '/') != NULL, "strchr finds a character");
}

static void test_printf(void)
{
    char buffer[64];

    suite("printf");
    ksnprintf(buffer, sizeof(buffer), "%d %u %x", -5, 5u, 0xBEEFu);
    check(strcmp(buffer, "-5 5 beef") == 0, "integers format correctly");

    ksnprintf(buffer, sizeof(buffer), "[%5d][%-5d][%05d]", 42, 42, 42);
    check(strcmp(buffer, "[   42][42   ][00042]") == 0, "width and padding work");

    ksnprintf(buffer, sizeof(buffer), "%s/%c%%", "dir", 'f');
    check(strcmp(buffer, "dir/f%") == 0, "strings, chars and escapes work");

    ksnprintf(buffer, 5, "%s", "truncate me");
    check(strlen(buffer) == 4, "output is clamped to the buffer");
}

static void test_div64(void)
{
    uint64_t big = 1000000000ull * 7;

    suite("div64");
    check(big / 1000 == 7000000ull, "64 bit division");
    check(big % 999983ull == (big - (big / 999983ull) * 999983ull), "64 bit modulo");
    check((uint64_t)(-1ll) / 2ull == 9223372036854775807ull, "unsigned wide division");
}

static void test_pmm(void)
{
    phys_addr_t frames[8];
    uint32_t    before = pmm_free_frames();

    suite("pmm");
    for (int i = 0; i < 8; i++) {
        frames[i] = pmm_alloc_frame();
        check(frames[i] != 0, "frame allocation returns memory");
        check((frames[i] & 0xFFF) == 0, "frames are page aligned");
    }

    for (int i = 0; i < 8; i++) {
        for (int j = i + 1; j < 8; j++) {
            if (frames[i] == frames[j]) {
                check(0, "frames are unique");
                break;
            }
        }
    }
    check(1, "frames are unique");

    for (int i = 0; i < 8; i++)
        pmm_free_frame(frames[i]);
    check(pmm_free_frames() == before, "freeing returns every frame");
}

static void test_paging(void)
{
    phys_addr_t frame = pmm_alloc_frame();
    virt_addr_t scratch = 0xE0000000u;
    volatile uint32_t *probe = (volatile uint32_t *)scratch;

    suite("paging");
    check(frame != 0, "got a frame to map");
    check(vmm_map(scratch, frame, PTE_PRESENT | PTE_WRITE) == 0, "vmm_map succeeds");
    check(vmm_is_mapped(scratch), "the page reports as mapped");
    check(vmm_translate(scratch) == frame, "translation returns the frame");

    *probe = 0x5EEDF00Du;
    check(*probe == 0x5EEDF00Du, "the mapping is readable and writable");
    check(*(volatile uint32_t *)frame == 0x5EEDF00Du,
          "the identity mapping sees the same bytes");

    vmm_unmap(scratch);
    check(!vmm_is_mapped(scratch), "unmapping clears the entry");
    pmm_free_frame(frame);
}

static void test_heap(void)
{
    void  *blocks[32];
    char  *text;
    size_t used_before = 0, used_after = 0;

    suite("heap");
    kheap_stats(&used_before, NULL, NULL, NULL);

    for (int i = 0; i < 32; i++) {
        blocks[i] = kmalloc(64 * (size_t)(i + 1));
        if (!blocks[i]) {
            check(0, "allocation succeeds");
            return;
        }
        memset(blocks[i], i, 64 * (size_t)(i + 1));
    }
    check(1, "32 allocations of growing size succeed");

    {
        int intact = 1;

        for (int i = 0; i < 32; i++) {
            uint8_t *p = (uint8_t *)blocks[i];

            for (size_t j = 0; j < 64 * (size_t)(i + 1); j++) {
                if (p[j] != (uint8_t)i) {
                    intact = 0;
                    break;
                }
            }
        }
        check(intact, "allocations do not overlap");
    }

    for (int i = 0; i < 32; i += 2)
        kfree(blocks[i]);
    for (int i = 1; i < 32; i += 2)
        kfree(blocks[i]);

    check(kheap_check() == 0, "the heap is still consistent");

    text = (char *)kmalloc(16);
    strcpy(text, "grow me");
    text = (char *)krealloc(text, 256);
    check(text && strcmp(text, "grow me") == 0, "krealloc preserves contents");
    kfree(text);

    kheap_stats(&used_after, NULL, NULL, NULL);
    check(used_after <= used_before + 64, "freed memory is returned to the heap");

    {
        void *zeroed = kcalloc(1, 128);
        int   clean = 1;

        for (int i = 0; i < 128; i++) {
            if (((uint8_t *)zeroed)[i]) {
                clean = 0;
                break;
            }
        }
        check(clean, "kcalloc zeroes memory");
        kfree(zeroed);
    }
}

static void test_fs(void)
{
    struct fs_node *node;
    char            buffer[128];
    char            path[FS_PATH_MAX];
    ssize_t         n;

    suite("fs");
    check(vfs_create(NULL, "/tmp/ktest", FS_DIR) != NULL, "mkdir works");
    node = vfs_create(NULL, "/tmp/ktest/file.txt", FS_FILE);
    check(node != NULL, "file creation works");
    check(vfs_create(NULL, "/tmp/ktest/file.txt", FS_FILE) == NULL,
          "creating an existing file fails");

    check(vfs_write(node, 0, "hello ", 6) == 6, "write returns the byte count");
    check(vfs_write(node, 6, "world", 5) == 5, "writing at an offset appends");
    check(node->size == 11, "size tracks the written bytes");

    n = vfs_read(node, 0, buffer, sizeof(buffer));
    buffer[n > 0 ? n : 0] = '\0';
    check(n == 11 && strcmp(buffer, "hello world") == 0, "read returns what was written");

    n = vfs_read(node, 6, buffer, sizeof(buffer));
    buffer[n > 0 ? n : 0] = '\0';
    check(strcmp(buffer, "world") == 0, "reading from an offset works");

    check(vfs_truncate(node, 5) == 0 && node->size == 5, "truncate shortens a file");

    /* A large write forces the ramfs buffer to grow several times. */
    {
        char big[600];
        int  ok = 1;

        for (size_t i = 0; i < sizeof(big); i++)
            big[i] = (char)('a' + (i % 26));
        check(vfs_write(node, 0, big, sizeof(big)) == (ssize_t)sizeof(big),
              "a large write succeeds");

        n = vfs_read(node, 0, buffer, sizeof(buffer));
        for (int i = 0; i < n; i++) {
            if (buffer[i] != (char)('a' + (i % 26)))
                ok = 0;
        }
        check(ok && node->size == sizeof(big), "the grown file reads back intact");
    }

    check(vfs_lookup(NULL, "/tmp/ktest/file.txt") == node, "absolute lookup works");
    check(vfs_lookup("/tmp", "ktest/file.txt") == node, "relative lookup works");
    check(vfs_lookup("/tmp/ktest", "../ktest/./file.txt") == node,
          "dot and dot-dot resolve");
    check(vfs_lookup(NULL, "/tmp/ktest/missing") == NULL, "missing paths return null");

    vfs_abspath("/tmp/ktest", "../../etc/../tmp", path, sizeof(path));
    check(strcmp(path, "/tmp") == 0, "abspath normalises a messy path");

    check(vfs_path_of(node, path, sizeof(path)) == 0 &&
          strcmp(path, "/tmp/ktest/file.txt") == 0, "path_of rebuilds the path");

    check(vfs_write_file("/tmp/ktest/helper.txt", "abc", 3) == 0, "write_file helper");
    check(vfs_append_file("/tmp/ktest/helper.txt", "def", 3) == 0, "append_file helper");
    n = vfs_read_file("/tmp/ktest/helper.txt", buffer, sizeof(buffer));
    buffer[n > 0 ? n : 0] = '\0';
    check(strcmp(buffer, "abcdef") == 0, "append lands after the original bytes");

    check(vfs_unlink(NULL, "/tmp/ktest") == 0, "removing a directory works");
    check(vfs_lookup(NULL, "/tmp/ktest/file.txt") == NULL,
          "children disappear with the directory");
    check(vfs_unlink(NULL, "/etc/motd") == -2, "read only files are protected");
}

/* --------------------------------------------------- scheduler behaviour */

static volatile int worker_ran;
static volatile int worker_order[4];
static volatile int worker_index;

static void test_worker(void *arg)
{
    int id = (int)(uintptr_t)arg;

    worker_ran++;
    if (worker_index < 4)
        worker_order[worker_index++] = id;
    thread_sleep_ms(20);
    thread_exit(id * 10);
}

static void test_sched(void)
{
    int tids[3];
    uint64_t before, after;

    suite("sched");
    worker_ran = 0;
    worker_index = 0;

    for (int i = 0; i < 3; i++) {
        tids[i] = thread_create("ktest", test_worker, (void *)(uintptr_t)(i + 1));
        check(tids[i] > 0, "thread creation returns a tid");
    }

    for (int i = 0; i < 3; i++)
        check(thread_join(tids[i]) == (i + 1) * 10, "join returns the exit code");

    check(worker_ran == 3, "every thread ran");

    before = timer_ms();
    thread_sleep_ms(120);
    after = timer_ms();
    check(after - before >= 110, "sleep blocks for at least the requested time");

    check(thread_current() != NULL && thread_current()->tid >= 0,
          "the current thread is identifiable");
    check(thread_kill(9999) < 0, "killing a missing thread fails cleanly");
}

static void test_interrupts(void)
{
    uint64_t start = timer_ticks();
    int      spins = 0;

    suite("interrupts");
    check(eflags_read() & 0x200, "interrupts are enabled");

    while (timer_ticks() == start && spins < 100000000)
        spins++;
    check(timer_ticks() > start, "the timer interrupt is firing");
    check(timer_hz() == 100, "the PIT runs at the configured rate");
}

int ktest_run(void)
{
    uint64_t started = timer_ms();

    checks_run = 0;
    checks_failed = 0;

    kprintf("\nrunning kernel self-tests\n");

    test_string();
    test_printf();
    test_div64();
    test_pmm();
    test_paging();
    test_heap();
    test_fs();
    test_sched();
    test_interrupts();

    kprintf("\nselftest: %d checks, %d passed, %d failed, %u ms\n\n",
            checks_run, checks_run - checks_failed, checks_failed,
            (uint32_t)(timer_ms() - started));

    return checks_failed;
}
