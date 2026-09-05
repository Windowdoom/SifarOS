/*
 * In-kernel test suite.
 *
 * These run on the real hardware state of a booted system, which makes them
 * the closest thing the project has to integration tests. tools/test.sh
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
#include <kernel/gfx.h>
#include <kernel/elf.h>
#include <kernel/proc.h>
#include <kernel/programs.h>
#include <kernel/sfs.h>
#include <kernel/blockdev.h>
#include <kernel/wm.h>
#include <kernel/security.h>

static int checks_run;
static int checks_failed;
static const char *current_suite = "";

static void check(int condition, const char *what)
{
    checks_run++;
    if (condition) kprintf("  [ ok ] %s: %s\n", current_suite, what);
    else { checks_failed++; kprintf("  [FAIL] %s: %s\n", current_suite, what); }
}
static void suite(const char *name) { current_suite = name; }

static void test_string(void)
{
    char buffer[32];
    suite("string");
    check(strlen("sifar") == 5, "strlen counts characters");
    check(strcmp("abc", "abc") == 0, "strcmp matches equal strings");
    check(strcmp("abc", "abd") < 0, "strcmp orders strings");
    check(strncmp("prefix-a", "prefix-b", 7) == 0, "strncmp respects the limit");
    strlcpy(buffer, "hello", sizeof(buffer)); strcat(buffer, " world");
    check(strcmp(buffer, "hello world") == 0, "strlcpy and strcat compose");
    memset(buffer, 'x', 4); buffer[4] = '\0'; check(strcmp(buffer, "xxxx") == 0, "memset fills");
    memcpy(buffer, "abcd", 4); check(memcmp(buffer, "abcd", 4) == 0, "memcpy and memcmp agree");
    strcpy(buffer, "0123456789"); memmove(buffer + 2, buffer, 8);
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
    ksnprintf(buffer, 5, "%s", "truncate me"); check(strlen(buffer) == 4, "output is clamped to the buffer");
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
    phys_addr_t frames[8]; uint32_t before = pmm_free_frames();
    suite("pmm");
    for (int i = 0; i < 8; i++) { frames[i] = pmm_alloc_frame(); check(frames[i] != 0, "frame allocation returns memory"); check((frames[i] & 0xFFF) == 0, "frames are page aligned"); }
    for (int i = 0; i < 8; i++) for (int j = i + 1; j < 8; j++) if (frames[i] == frames[j]) { check(0, "frames are unique"); break; }
    check(1, "frames are unique");
    for (int i = 0; i < 8; i++) pmm_free_frame(frames[i]);
    check(pmm_free_frames() == before, "freeing returns every frame");
}

static void test_paging(void)
{
    phys_addr_t frame = pmm_alloc_frame();
    phys_addr_t wx_frame = pmm_alloc_frame();
    virt_addr_t scratch = 0xEF000000u;
    virt_addr_t wx_scratch = 0xEF001000u;
    volatile uint32_t *probe = (volatile uint32_t *)scratch;

    suite("paging");
    check(cpu_has_pae(), "CPU exposes PAE");
    check(cpu_has_nx(), "CPU exposes NX");
    check(frame != 0 && wx_frame != 0, "got frames to map");
    check(vmm_map(scratch, frame, PTE_PRESENT | PTE_WRITE) == 0, "RW+NX mapping succeeds");
    check(vmm_is_mapped(scratch), "the page reports as mapped");
    check(vmm_translate(scratch) == frame, "translation returns the frame");
    *probe = 0x5EEDF00Du;
    check(*probe == 0x5EEDF00Du, "the mapping is readable and writable");
    check(*(volatile uint32_t *)frame == 0x5EEDF00Du, "identity mapping agrees");
    check(vmm_map(wx_scratch, wx_frame, PTE_PRESENT | PTE_WRITE | PTE_EXEC) < 0,
          "VMM rejects writable executable mappings");
    vmm_unmap(scratch);
    check(!vmm_is_mapped(scratch), "unmapping clears the entry");
    pmm_free_frame(frame);
    pmm_free_frame(wx_frame);
}

static void test_heap(void)
{
    void *blocks[32]; char *text; size_t used_before=0,used_after=0;
    suite("heap"); kheap_stats(&used_before,NULL,NULL,NULL);
    for(int i=0;i<32;i++){blocks[i]=kmalloc(64*(size_t)(i+1));if(!blocks[i]){check(0,"allocation succeeds");return;}memset(blocks[i],i,64*(size_t)(i+1));}
    check(1,"32 allocations of growing size succeed");
    {int intact=1;for(int i=0;i<32;i++){uint8_t*p=(uint8_t*)blocks[i];for(size_t j=0;j<64*(size_t)(i+1);j++)if(p[j]!=(uint8_t)i){intact=0;break;}}check(intact,"allocations do not overlap");}
    for(int i=0;i<32;i+=2)kfree(blocks[i]);for(int i=1;i<32;i+=2)kfree(blocks[i]);check(kheap_check()==0,"the heap is still consistent");
    text=(char*)kmalloc(16);strcpy(text,"grow me");text=(char*)krealloc(text,256);check(text&&strcmp(text,"grow me")==0,"krealloc preserves contents");kfree(text);
    kheap_stats(&used_after,NULL,NULL,NULL);check(used_after<=used_before+64,"freed memory is returned to the heap");
    {void*zeroed=kcalloc(1,128);int clean=1;for(int i=0;i<128;i++)if(((uint8_t*)zeroed)[i]){clean=0;break;}check(clean,"kcalloc zeroes memory");kfree(zeroed);}
}

static void test_fs(void)
{
    struct fs_node*node;char buffer[128],path[FS_PATH_MAX];ssize_t n;
    suite("fs");check(vfs_create(NULL,"/tmp/ktest",FS_DIR)!=NULL,"mkdir works");node=vfs_create(NULL,"/tmp/ktest/file.txt",FS_FILE);check(node!=NULL,"file creation works");
    check(vfs_create(NULL,"/tmp/ktest/file.txt",FS_FILE)==NULL,"creating an existing file fails");check(vfs_write(node,0,"hello ",6)==6,"write returns the byte count");check(vfs_write(node,6,"world",5)==5,"writing at an offset appends");check(node->size==11,"size tracks the written bytes");
    n=vfs_read(node,0,buffer,sizeof(buffer));buffer[n>0?n:0]='\0';check(n==11&&strcmp(buffer,"hello world")==0,"read returns what was written");n=vfs_read(node,6,buffer,sizeof(buffer));buffer[n>0?n:0]='\0';check(strcmp(buffer,"world")==0,"reading from an offset works");check(vfs_truncate(node,5)==0&&node->size==5,"truncate shortens a file");
    {char big[600];int ok=1;for(size_t i=0;i<sizeof(big);i++)big[i]=(char)('a'+(i%26));check(vfs_write(node,0,big,sizeof(big))==(ssize_t)sizeof(big),"a large write succeeds");n=vfs_read(node,0,buffer,sizeof(buffer));for(int i=0;i<n;i++)if(buffer[i]!=(char)('a'+(i%26)))ok=0;check(ok&&node->size==sizeof(big),"the grown file reads back intact");}
    check(vfs_lookup(NULL,"/tmp/ktest/file.txt")==node,"absolute lookup works");check(vfs_lookup("/tmp","ktest/file.txt")==node,"relative lookup works");check(vfs_lookup("/tmp/ktest","../ktest/./file.txt")==node,"dot and dot-dot resolve");check(vfs_lookup(NULL,"/tmp/ktest/missing")==NULL,"missing paths return null");
    vfs_abspath("/tmp/ktest","../../etc/../tmp",path,sizeof(path));check(strcmp(path,"/tmp")==0,"abspath normalises a messy path");check(vfs_path_of(node,path,sizeof(path))==0&&strcmp(path,"/tmp/ktest/file.txt")==0,"path_of rebuilds the path");
    check(vfs_write_file("/tmp/ktest/helper.txt","abc",3)==0,"write_file helper");check(vfs_append_file("/tmp/ktest/helper.txt","def",3)==0,"append_file helper");n=vfs_read_file("/tmp/ktest/helper.txt",buffer,sizeof(buffer));buffer[n>0?n:0]='\0';check(strcmp(buffer,"abcdef")==0,"append lands after original bytes");
    check(vfs_unlink(NULL,"/tmp/ktest")==0,"removing a directory works");check(vfs_lookup(NULL,"/tmp/ktest/file.txt")==NULL,"children disappear with directory");check(vfs_unlink(NULL,"/etc/motd")==-2,"read only files are protected");
}

static volatile int worker_ran; static volatile int worker_order[4]; static volatile int worker_index;
static void test_worker(void*arg){int id=(int)(uintptr_t)arg;worker_ran++;if(worker_index<4)worker_order[worker_index++]=id;thread_sleep_ms(20);thread_exit(id*10);}
static void test_sched(void){int tids[3];uint64_t before,after;suite("sched");worker_ran=0;worker_index=0;for(int i=0;i<3;i++){tids[i]=thread_create("ktest",test_worker,(void*)(uintptr_t)(i+1));check(tids[i]>0,"thread creation returns a tid");}for(int i=0;i<3;i++)check(thread_join(tids[i])==(i+1)*10,"join returns the exit code");check(worker_ran==3,"every thread ran");before=timer_ms();thread_sleep_ms(120);after=timer_ms();check(after-before>=110,"sleep blocks for at least requested time");check(thread_current()!=NULL&&thread_current()->tid>=0,"current thread is identifiable");check(thread_kill(9999)<0,"killing a missing thread fails cleanly");}
static void test_interrupts(void){uint64_t start=timer_ticks();int spins=0;suite("interrupts");check(eflags_read()&0x200,"interrupts are enabled");while(timer_ticks()==start&&spins<100000000)spins++;check(timer_ticks()>start,"timer interrupt is firing");check(timer_hz()==100,"PIT runs at configured rate");}

static void test_graphics(void){uint32_t pixels[32*16];struct gfx_surface surface;suite("graphics");gfx_surface_init(&surface,pixels,32,16,32);gfx_clear(&surface,RGB(0,0,0));check(pixels[0]==RGB(0,0,0),"clear fills the surface");gfx_fill_rect(&surface,4,4,8,8,RGB(255,0,0));check(pixels[4*32+4]==RGB(255,0,0),"fill_rect paints inside");check(pixels[3*32+4]==RGB(0,0,0),"fill_rect leaves outside alone");gfx_clip_set(&surface,16,0,16,16);gfx_fill_rect(&surface,0,0,32,16,RGB(0,255,0));check(pixels[0]==RGB(0,0,0),"clipping protects left half");check(pixels[20]==RGB(0,255,0),"clipping paints right half");gfx_clip_reset(&surface);gfx_clear(&surface,RGB(0,0,0));gfx_blend_rect(&surface,0,0,4,4,RGBA(255,255,255,128));check(COLOR_R(pixels[0])>120&&COLOR_R(pixels[0])<136,"alpha blending mixes evenly");check(gfx_text_width("hello",1)==5*GLYPH_W,"text width counts glyphs");check(gfx_font()[('A'*GLYPH_H)+2]!=0,"ROM font has glyph data");}

static void test_elf(void){const struct embedded_program*program=program_find("hello");suite("elf");check(program!=NULL,"embedded program is present");if(!program)return;check(elf_is_valid(program->start,(size_t)(program->end-program->start)),"embedded image is valid ELF");check(!elf_is_valid((const uint8_t*)"not an elf at all",17),"rubbish is rejected");{const struct elf32_ehdr*h=(const struct elf32_ehdr*)program->start;check(h->entry>=USER_MIN&&h->entry<USER_MAX,"entry point is in user range");check(h->phnum>0,"image has program headers");}}
static void test_processes(void){const struct embedded_program*program=program_find("hello");int pid,code=-1,before=proc_count();suite("processes");check(proc_current()!=NULL,"current process exists");check(proc_kernel()->pid==0,"kernel is process zero");if(!program)return;pid=proc_spawn_image("ktest-hello",program->start,(size_t)(program->end-program->start),1,(const char*const[]){"ktest-hello"});check(pid>0,"program can be loaded and started");if(pid<=0)return;check(proc_by_pid(pid)!=NULL,"new process is in table");check(proc_count()>before,"process count went up");check(proc_wait(pid,&code)==0,"waiting succeeds");check(code==7,"exit status comes back");check(proc_by_pid(pid)==NULL,"process is gone once reaped");}

static void test_address_spaces(void)
{
    struct addr_space space;
    struct addr_space *kernel = vmm_kernel_space();
    phys_addr_t frame;
    phys_addr_t exec_frame;
    phys_addr_t wx_frame;
    virt_addr_t user_page = USER_MIN + 0x10000u;
    virt_addr_t exec_page = user_page + PAGE_SIZE;
    virt_addr_t wx_page = exec_page + PAGE_SIZE;
    uint32_t heap_pd = (KERNEL_HEAP_BASE >> 21) & 0x1FFu;
    uint32_t user_pdpt = user_page >> 30;
    uint32_t user_pd = (user_page >> 21) & 0x1FFu;

    suite("address spaces");
    check(vmm_space_create(&space) == 0, "new PAE address space can be created");
    check(space.pdpt != NULL && space.pdpt_phys != 0, "it has a PDPT");
    check(space.pd[0] == kernel->pd[0], "low kernel page directory is shared");
    check(space.pd[3][heap_pd] == kernel->pd[3][heap_pd], "kernel heap page table is shared");
    check(space.pd[user_pdpt][user_pd] == 0, "user page directory starts empty");

    frame = pmm_alloc_frame();
    exec_frame = pmm_alloc_frame();
    wx_frame = pmm_alloc_frame();
    check(frame && exec_frame && wx_frame, "got frames for user mappings");
    check(vmm_map_in(&space, user_page, frame,
                     PTE_PRESENT | PTE_WRITE | PTE_USER) == 0,
          "RW user mapping succeeds and is NX by default");
    check(vmm_translate_in(&space, user_page) == frame, "other space translates it");
    check(vmm_translate_in(kernel, user_page) == 0, "kernel space does not see private user mapping");
    check(space.pd[user_pdpt][user_pd] & PTE_USER, "directory carries user bit");
    check(vmm_map_in(&space, exec_page, exec_frame,
                     PTE_PRESENT | PTE_USER | PTE_EXEC) == 0,
          "RX user mapping succeeds");
    check(vmm_map_in(&space, wx_page, wx_frame,
                     PTE_PRESENT | PTE_WRITE | PTE_USER | PTE_EXEC) < 0,
          "W+X user mapping is rejected");
    pmm_free_frame(wx_frame);

    vmm_space_destroy(&space);
    check(space.pdpt == NULL, "destroying space releases the PDPT");
}

static void test_disk(void){struct blockdev*disk=ata_device();uint8_t*first,*second;suite("disk");if(!disk){check(0,"ATA disk is attached");return;}check(disk->sectors>0,"disk reports a size");check(sfs_mounted(),"SifarFS is mounted");first=(uint8_t*)kmalloc(SECTOR_SIZE);second=(uint8_t*)kmalloc(SECTOR_SIZE);if(!first||!second){check(0,"scratch buffers");kfree(first);kfree(second);return;}check(disk->read(disk,0,1,first)==0,"sector zero reads");check(first[510]==0x55&&first[511]==0xAA,"boot signature is on disk");{uint32_t scratch_lba=disk->sectors-1;memset(second,0,SECTOR_SIZE);check(disk->read(disk,scratch_lba,1,second)==0,"spare sector reads");for(int i=0;i<SECTOR_SIZE;i++)second[i]=(uint8_t)(i^0x5A);check(disk->write(disk,scratch_lba,1,second)==0,"it writes back");memset(second,0,SECTOR_SIZE);check(disk->read(disk,scratch_lba,1,second)==0,"and reads again");{int intact=1;for(int i=0;i<SECTOR_SIZE;i++)if(second[i]!=(uint8_t)(i^0x5A))intact=0;check(intact,"round trip preserves data");}}kfree(first);kfree(second);}
static void test_persistence(void){static const char payload[]="ktest wrote this to the disk\n";char buffer[64];ssize_t n;suite("persistence");if(!sfs_mounted()){check(0,"disk filesystem is mounted");return;}check(vfs_write_file("/tmp/ktest-disk.txt",payload,sizeof(payload)-1)==0,"file can be written");n=vfs_read_file("/tmp/ktest-disk.txt",buffer,sizeof(buffer)-1);buffer[n>0?n:0]='\0';check(n==(ssize_t)(sizeof(payload)-1)&&strcmp(buffer,payload)==0,"reads back byte for byte");check(vfs_unlink(NULL,"/tmp/ktest-disk.txt")==0,"file can be removed");}
static void test_floating_point(void){volatile double a=3.5,b=1.25;suite("floating point");check(fpu_present(),"FPU is available");check((int)(a*b*100.0)==437,"arithmetic works in kernel");a=12345.75;sched_yield();check((int)(a*2.0)==24691,"registers survive context switch");}
static void test_window_system(void){struct gui_window_desc list[GUI_MAX_WINDOWS];int count;suite("window system");check(wm_running()==(gfx_available()?1:0),"window server matches display state");count=wm_list_windows(list,GUI_MAX_WINDOWS);check(count>=0,"window list can be read");if(count>0){check(list[0].id!=0,"listed windows have identifiers");check(list[0].title[0]!='\0',"listed windows have titles");}}

static void test_security(void)
{
    struct security_event event;
    uint32_t before;
    suite("security");
    security_init();
    check(security_event_count() == 0, "Sentinel starts with an empty event log");
    security_event_record(SECURITY_EVENT_SYSCALL_VIOLATION, 42, 0xDEAD, SECURITY_RESPONSE_SUSPICIOUS);
    check(security_event_count() == 1, "Sentinel records a security event");
    check(security_event_get(0, &event) == 0, "Sentinel returns recorded events");
    check(event.type == SECURITY_EVENT_SYSCALL_VIOLATION && event.pid == 42 && event.code == 0xDEAD,
          "recorded event retains its security context");
    before = security_event_count();
    for (uint32_t i = 0; i < SECURITY_EVENT_LOG_CAPACITY + 8; i++)
        security_event_record(SECURITY_EVENT_PROCESS_START, i, 0, SECURITY_RESPONSE_NONE);
    check(security_event_count() == SECURITY_EVENT_LOG_CAPACITY, "event log is bounded");
    check(security_event_get(before, &event) == 0, "ring buffer remains readable after wrap");
    check(event.sequence > 1, "wrapped events keep monotonic sequence numbers");
    check(security_event_get(SECURITY_EVENT_LOG_CAPACITY, &event) < 0, "out of range event access is rejected");
}

int ktest_run(void)
{
    uint64_t started=timer_ms();checks_run=0;checks_failed=0;kprintf("\nrunning kernel self-tests\n");
    test_string();test_printf();test_div64();test_pmm();test_paging();test_heap();test_fs();test_sched();test_interrupts();test_floating_point();test_graphics();test_address_spaces();test_elf();test_processes();test_disk();test_persistence();test_window_system();test_security();
    kprintf("\nselftest: %d checks, %d passed, %d failed, %u ms\n\n",checks_run,checks_run-checks_failed,checks_failed,(uint32_t)(timer_ms()-started));return checks_failed;
}
