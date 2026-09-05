/*
 * Processes.
 *
 * A process owns an address space, a heap and one or more threads. The kernel
 * itself is process 0 and keeps the kernel address space; everything loaded
 * from disk gets a private one. Cross-process control is denied unless the
 * caller is the direct parent or holds an explicit kernel-granted capability.
 */
#include <arch/x86.h>
#include <kernel/elf.h>
#include <kernel/fs.h>
#include <kernel/io.h>
#include <kernel/kprintf.h>
#include <kernel/mm.h>
#include <kernel/proc.h>
#include <kernel/sched.h>
#include <kernel/security.h>
#include <kernel/string.h>
#include <kernel/wm.h>
#include <sys/syscall.h>

#define USER_STACK_PAGES 16
#define ARG_AREA_MAX 1024

extern void enter_usermode(uint32_t entry, uint32_t user_stack)
    __attribute__((noreturn));

static struct process table[MAX_PROCESSES];
static struct process *kernel_process;
static int next_pid = 1;

struct process *proc_kernel(void) { return kernel_process; }

struct process *proc_current(void) {
  struct thread *t = thread_current();
  if (t && t->proc)
    return (struct process *)t->proc;
  return kernel_process;
}

struct process *proc_by_pid(int pid) {
  for (int i = 0; i < MAX_PROCESSES; i++) {
    if (table[i].state != PROC_FREE && table[i].pid == pid)
      return &table[i];
  }
  return NULL;
}

int proc_count(void) {
  int n = 0;
  for (int i = 0; i < MAX_PROCESSES; i++)
    if (table[i].state != PROC_FREE)
      n++;
  return n;
}

void proc_foreach(void (*fn)(const struct process *, void *), void *ctx) {
  for (int i = 0; i < MAX_PROCESSES; i++)
    if (table[i].state != PROC_FREE)
      fn(&table[i], ctx);
}

int proc_grant_caps(int pid, uint32_t caps) {
  struct process *proc = proc_by_pid(pid);

  if (!proc)
    return -1;
  proc->capabilities |= caps & PROC_CAP_ALL;
  return 0;
}

int proc_revoke_caps(int pid, uint32_t caps) {
  struct process *proc = proc_by_pid(pid);

  if (!proc || proc == kernel_process)
    return -1;
  proc->capabilities &= ~(caps & PROC_CAP_ALL);
  return 0;
}

int proc_has_cap(const struct process *proc, uint32_t cap) {
  if (proc == kernel_process)
    return 1;
  return proc && (proc->capabilities & cap) == cap;
}

void proc_init(void) {
  memset(table, 0, sizeof(table));
  kernel_process = &table[0];
  kernel_process->pid = 0;
  kernel_process->parent = 0;
  kernel_process->state = PROC_RUNNING;
  kernel_process->space = *vmm_kernel_space();
  strlcpy(kernel_process->name, "kernel", PROC_NAME_MAX);
  strlcpy(kernel_process->cwd, "/", FS_PATH_MAX);
}

static struct process *allocate(void) {
  for (int i = 1; i < MAX_PROCESSES; i++)
    if (table[i].state == PROC_FREE)
      return &table[i];
  for (int i = 1; i < MAX_PROCESSES; i++) {
    if (table[i].state == PROC_ZOMBIE && table[i].cleaned) {
      table[i].state = PROC_FREE;
      return &table[i];
    }
  }
  return NULL;
}

/* ------------------------------------------------------------ user memory */

int proc_user_range_ok(const void *ptr, size_t len) {
  struct process *proc = proc_current();
  if (proc == kernel_process)
    return 0;
  return vmm_access_ok_in(&proc->space, (virt_addr_t)(uintptr_t)ptr, len, 0);
}

int proc_user_write_ok(void *ptr, size_t len) {
  struct process *proc = proc_current();
  if (proc == kernel_process)
    return 0;
  return vmm_access_ok_in(&proc->space, (virt_addr_t)(uintptr_t)ptr, len, 1);
}

int proc_copy_user_string(const char *user, char *out, size_t size) {
  if (!out || size == 0)
    return -1;
  for (size_t i = 0; i + 1 < size; i++) {
    if (!proc_user_range_ok(user + i, 1))
      return -1;
    out[i] = user[i];
    if (!out[i])
      return (int)i;
  }
  out[size - 1] = '\0';
  return -1;
}

virt_addr_t proc_sbrk(int32_t increment) {
  struct process *proc = proc_current();
  virt_addr_t previous;
  if (proc == kernel_process)
    return 0;
  previous = proc->brk;

  if (increment > 0) {
    uint32_t amount = (uint32_t)increment;
    virt_addr_t limit =
        proc->stack_top - (uint32_t)USER_STACK_PAGES * PAGE_SIZE;
    virt_addr_t target;
    uint32_t old_pages, new_pages;
    if (proc->brk > USER_MAX - amount)
      return 0;
    target = proc->brk + amount;
    if (target >= limit)
      return 0;
    old_pages = (uint32_t)((ALIGN_UP(previous, PAGE_SIZE) -
                            ALIGN_UP(proc->brk_start, PAGE_SIZE)) /
                           PAGE_SIZE);
    new_pages = (uint32_t)((ALIGN_UP(target, PAGE_SIZE) -
                            ALIGN_UP(proc->brk_start, PAGE_SIZE)) /
                           PAGE_SIZE);
    if (vmm_alloc_range(&proc->space, proc->brk, (size_t)amount,
                        PTE_PRESENT | PTE_WRITE | PTE_USER) < 0)
      return 0;
    proc->brk = target;
    proc->user_pages += new_pages - old_pages;
  } else if (increment < 0) {
    uint32_t shrink = (uint32_t)(-(int64_t)increment);
    virt_addr_t floor = proc->brk_start;
    virt_addr_t target;
    if (shrink > proc->brk - floor)
      shrink = proc->brk - floor;
    target = proc->brk - shrink;
    vmm_free_range(&proc->space, ALIGN_UP(target, PAGE_SIZE),
                   ALIGN_UP(proc->brk, PAGE_SIZE) -
                       ALIGN_UP(target, PAGE_SIZE));
    proc->brk = target;
    proc->user_pages = (uint32_t)((ALIGN_UP(proc->brk, PAGE_SIZE) -
                                   ALIGN_UP(proc->brk_start, PAGE_SIZE)) /
                                  PAGE_SIZE) +
                       USER_STACK_PAGES;
  }
  return previous;
}

/* ------------------------------------------------------------- launching */

struct launch {
  struct process *proc;
  virt_addr_t entry;
  virt_addr_t stack;
};

static struct launch pending[MAX_PROCESSES];

static int build_stack(struct process *proc, int argc, const char *const *argv,
                       virt_addr_t *out_esp) {
  uint8_t scratch[ARG_AREA_MAX];
  uint32_t pointers[16];
  size_t strings_len = 0;
  size_t pointer_bytes;
  size_t total;
  virt_addr_t base;

  if (!proc || !out_esp || argc < 0 || (argc > 0 && !argv))
    return -1;
  if (argc > 15)
    argc = 15;

  pointer_bytes = 4 + ((size_t)argc + 1) * 4;
  if (pointer_bytes > sizeof(scratch))
    return -1;

  for (int i = 0; i < argc; i++) {
    size_t len;

    if (!argv[i])
      return -1;
    len = strlen(argv[i]) + 1;
    if (len > sizeof(scratch) - pointer_bytes - strings_len)
      return -1;
    strings_len += len;
  }

  total = ALIGN_UP(pointer_bytes + strings_len, 16);
  if (total > sizeof(scratch))
    return -1;
  base = proc->stack_top - total;

  {
    size_t string_offset = pointer_bytes;
    for (int i = 0; i < argc; i++) {
      size_t len = strlen(argv[i]) + 1;
      memcpy(scratch + string_offset, argv[i], len);
      pointers[i] = (uint32_t)(base + string_offset);
      string_offset += len;
    }
  }
  memset(scratch, 0, pointer_bytes);
  *(uint32_t *)scratch = (uint32_t)argc;
  for (int i = 0; i < argc; i++)
    *(uint32_t *)(scratch + 4 + i * 4) = pointers[i];
  *(uint32_t *)(scratch + 4 + argc * 4) = 0;

  for (size_t offset = 0; offset < total;) {
    virt_addr_t dst = base + offset;
    phys_addr_t phys = vmm_translate_in(&proc->space, dst);
    size_t page_offset = dst & (PAGE_SIZE - 1);
    size_t chunk = PAGE_SIZE - page_offset;
    if (!phys)
      return -1;
    if (chunk > total - offset)
      chunk = total - offset;
    memcpy((void *)(uintptr_t)phys, scratch + offset, chunk);
    offset += chunk;
  }
  *out_esp = base;
  return 0;
}

static void process_entry(void *arg) {
  struct launch *launch = (struct launch *)arg;
  struct thread *self = thread_current();
  struct process *proc = launch->proc;
  self->proc = proc;
  self->space = &proc->space;
  self->user = 1;
  vmm_space_switch(&proc->space);
  tss_set_kernel_stack(self->stack_base + self->stack_size);
  enter_usermode(launch->entry, launch->stack);
}

int proc_spawn_image(const char *name, const uint8_t *image, size_t size,
                     int argc, const char *const *argv) {
  struct process *proc;
  struct process *parent = proc_current();
  virt_addr_t entry = 0, brk = 0, esp = 0;
  int slot;
  int tid;

  if (argc < 0 || (argc > 0 && !argv))
    return -1;
  if (!elf_is_valid(image, size))
    return -1;
  proc = allocate();
  if (!proc)
    return -2;
  slot = (int)(proc - table);
  memset(proc, 0, sizeof(*proc));
  proc->pid = next_pid++;
  proc->parent = parent ? parent->pid : 0;
  proc->state = PROC_RUNNING;
  proc->started_ms = timer_ms();
  proc->stack_top = USER_STACK_TOP;
  strlcpy(proc->name, name, PROC_NAME_MAX);
  strlcpy(proc->cwd, parent ? parent->cwd : "/", FS_PATH_MAX);

  if (vmm_space_create(&proc->space) < 0) {
    proc->state = PROC_FREE;
    return -3;
  }
  if (elf_load(&proc->space, image, size, &entry, &brk) < 0) {
    vmm_space_destroy(&proc->space);
    proc->state = PROC_FREE;
    return -4;
  }
  proc->brk_start = brk;
  proc->brk = brk;
  if (vmm_alloc_range(&proc->space,
                      proc->stack_top - USER_STACK_PAGES * PAGE_SIZE,
                      USER_STACK_PAGES * PAGE_SIZE,
                      PTE_PRESENT | PTE_WRITE | PTE_USER) < 0) {
    vmm_space_destroy(&proc->space);
    proc->state = PROC_FREE;
    return -5;
  }
  proc->user_pages = USER_STACK_PAGES;
  if (build_stack(proc, argc, argv, &esp) < 0) {
    vmm_space_destroy(&proc->space);
    proc->state = PROC_FREE;
    return -6;
  }
  pending[slot].proc = proc;
  pending[slot].entry = entry;
  pending[slot].stack = esp;
  tid = thread_create(proc->name, process_entry, &pending[slot]);
  if (tid < 0) {
    vmm_space_destroy(&proc->space);
    proc->state = PROC_FREE;
    return -7;
  }
  proc->main_tid = tid;
  security_event_record(SECURITY_EVENT_PROCESS_START, (uint32_t)proc->pid, 0,
                        SECURITY_RESPONSE_NONE);
  return proc->pid;
}

int proc_spawn(const char *path, int argc, const char *const *argv) {
  struct process *caller = proc_current();
  struct fs_node *node = vfs_lookup(caller->cwd, path);
  char absolute[FS_PATH_MAX];
  uint8_t *image;
  ssize_t read;
  int result;
  const char *name;

  if (!node || node->type != FS_FILE)
    return -1;
  if (vfs_abspath(caller->cwd, path, absolute, sizeof(absolute)) < 0)
    return -1;
  image = (uint8_t *)kmalloc(node->size);
  if (!image)
    return -2;
  read = vfs_read(node, 0, image, node->size);
  if (read <= 0) {
    kfree(image);
    return -3;
  }
  name = strrchr(absolute, '/');
  name = name ? name + 1 : absolute;
  result = proc_spawn_image(name, image, (size_t)read, argc, argv);
  kfree(image);

  /* Network authority belongs only to the immutable packaged
   * browser at its canonical path. Capabilities are never inherited. */
  if (result > 0 && node->readonly && strcmp(absolute, "/apps/browser") == 0)
    proc_grant_caps(result, PROC_CAP_NETWORK);
  return result;
}

/* ------------------------------------------------------------- lifecycle */

void proc_exit(int code) {
  struct process *proc = proc_current();
  if (proc != kernel_process) {
    proc->exit_code = code;
    proc->state = PROC_ZOMBIE;
    security_event_record(SECURITY_EVENT_PROCESS_EXIT, (uint32_t)proc->pid,
                          (uint32_t)code, SECURITY_RESPONSE_NONE);
  }
  thread_exit(code);
}

void proc_reap(void) {
  for (int i = 1; i < MAX_PROCESSES; i++) {
    struct process *proc = &table[i];
    uint32_t flags;
    if (proc->state != PROC_ZOMBIE || proc->cleaned)
      continue;
    if (thread_exists(proc->main_tid))
      continue;
    flags = irq_save();
    wm_close_process_windows(proc);
    vmm_space_destroy(&proc->space);
    proc->cleaned = 1;
    proc->user_pages = 0;
    irq_restore(flags);
  }
}

static int may_reap(struct process *caller, const struct process *target) {
  if (!caller || !target || target == kernel_process || target == caller)
    return 0;
  return caller == kernel_process || target->parent == caller->pid ||
         proc_has_cap(caller, PROC_CAP_PROCESS_CONTROL);
}

int proc_wait(int pid, int *exit_code) {
  struct process *caller = proc_current();
  struct process *proc = proc_by_pid(pid);

  if (!may_reap(caller, proc))
    return -1;
  while (proc->state == PROC_RUNNING)
    sched_yield();
  while (!proc->cleaned)
    sched_yield();
  if (exit_code)
    *exit_code = proc->exit_code;
  proc->state = PROC_FREE;
  return 0;
}

int proc_try_wait(int pid, int *exit_code) {
  struct process *caller = proc_current();
  struct process *proc = proc_by_pid(pid);

  if (!may_reap(caller, proc))
    return -1;
  if (proc->state == PROC_RUNNING || !proc->cleaned)
    return 0;
  if (exit_code)
    *exit_code = proc->exit_code;
  proc->state = PROC_FREE;
  return 1;
}

int proc_kill(int pid) {
  struct process *caller = proc_current();
  struct process *proc = proc_by_pid(pid);

  if (!proc || proc == kernel_process || proc == caller)
    return -1;
  if (caller != kernel_process && proc->parent != caller->pid &&
      !proc_has_cap(caller, PROC_CAP_PROCESS_CONTROL)) {
    security_event_record(SECURITY_EVENT_CAPABILITY_DENIED,
                          caller ? (uint32_t)caller->pid : 0, SYS_KILL,
                          SECURITY_RESPONSE_SUSPICIOUS);
    return -1;
  }

  thread_kill(proc->main_tid);
  proc->exit_code = -1;
  proc->state = PROC_ZOMBIE;
  security_event_record(SECURITY_EVENT_PROCESS_EXIT, (uint32_t)proc->pid,
                        0xFFFFFFFFu, SECURITY_RESPONSE_KILL);
  return 0;
}
