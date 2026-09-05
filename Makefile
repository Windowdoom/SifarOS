# ============================================================================
# SifarOS build
#
#   make            build build/sifaros.img
#   make run        boot the image in QEMU
#   make run-serial boot headless with the kernel console on stdio
#   make test       serial test suite: boot, filesystem, processes, persistence
#   make test-gui   drive the desktop with mouse and keyboard, check the frames
#   make shot       save a screenshot of the booted desktop
#   make debug      boot stopped, waiting for gdb on localhost:1234
#   make clean
# ============================================================================

# ---- toolchain -------------------------------------------------------------
# The kernel is 32-bit x86, which a native compiler on macOS or on an ARM
# machine cannot target at all.  Prefer a cross compiler whenever one is
# installed and fall back to the system one, which is what works on a 32-bit
# capable Linux box with gcc-multilib.
CROSS ?= $(shell for prefix in i686-elf i386-elf i686-linux-gnu; do \
             if command -v $$prefix-gcc >/dev/null 2>&1; then \
                 printf '%s-' "$$prefix"; break; \
             fi; \
         done)

CC      := $(CROSS)gcc
LD      := $(CROSS)ld
AS      := $(CC)
NASM    := nasm
OBJCOPY := $(CROSS)objcopy

BUILD   := build
KERNEL_ELF := $(BUILD)/kernel.elf
KERNEL_BIN := $(BUILD)/kernel.bin
IMAGE      := $(BUILD)/sifaros.img

# Disk layout, mirrored in boot/stage2.asm
STAGE2_SECTORS := 8
KERNEL_LBA     := 9
KERNEL_SECTORS := 1024
FS_LBA         := 2048          # the filesystem starts here
IMAGE_SECTORS  := 131072        # 64 MiB disk

# -MMD -MP make the compiler emit header dependencies next to each object, so
# editing a header rebuilds everything that includes it.  Without this, a
# changed struct silently leaves stale objects behind and the layouts stop
# agreeing between translation units.
CFLAGS := -m32 -std=gnu11 -ffreestanding -fno-builtin -fno-stack-protector \
          -fno-pic -fno-pie -nostdlib -nostdinc -Wall -Wextra -Werror \
          -Wno-unused-parameter -O2 -g -MMD -MP -Iinclude
ASFLAGS := -m32 -c -Iinclude
LDFLAGS := -m elf_i386 -T linker.ld -nostdlib -z noexecstack

C_SOURCES := $(shell find kernel -name '*.c' | sort)
S_SOURCES := $(shell find kernel -name '*.S' | sort)
OBJECTS   := $(patsubst %.c,$(BUILD)/%.o,$(C_SOURCES)) \
             $(patsubst %.S,$(BUILD)/%.o,$(S_SOURCES))

# ---- user space ------------------------------------------------------------
# Applications are ordinary ELF executables linked against libsifar and the
# widget toolkit.  A couple of them are also embedded in the kernel image so
# there is always something to run even without a disk.
USER_DIR    := $(BUILD)/user
USER_LIB    := $(USER_DIR)/lib
APPS        := $(patsubst user/apps/%.c,%,$(wildcard user/apps/*.c))
EMBEDDED    := hello counter faulter
USER_BLOBS  := $(patsubst %,$(USER_DIR)/%_blob.o,$(EMBEDDED))
APP_ELVES   := $(patsubst %,$(USER_DIR)/%.elf,$(APPS))

USER_CFLAGS := -m32 -std=gnu11 -ffreestanding -fno-builtin -fno-stack-protector \
               -fno-pic -fno-pie -nostdlib -nostdinc -Wall -Wextra -Werror \
               -Wno-unused-parameter -Os -MMD -MP -Iinclude -Iuser/lib
LIB_OBJECTS := $(USER_LIB)/crt0.o $(USER_LIB)/sifar.o $(USER_LIB)/ui.o

# What goes into the filesystem image.
FS_CONTENT := \
	$(foreach app,$(APPS),--exec $(USER_DIR)/$(app).elf:/apps/$(app)) \
	--protected '/etc/motd:Welcome to SifarOS.\n' \
	--protected '/etc/release:SifarOS 0.2.0 (i386)\n' \
	--text '/home/readme.txt:This file lives on the disk and survives a reboot.\n\nOpen it in the text editor, change it, and it will still be here\nafter the next boot.\n' \
	--text '/docs/about.txt:SifarOS was written from scratch: bootloader, kernel, drivers,\nfilesystem, window system and every application you can see.\n'

.PHONY: all clean run run-serial test test-gui test-all debug shot apps toolchain

# Fail with an explanation rather than a hundred assembler errors when the
# compiler in use cannot produce 32-bit x86 code.
TOOLCHAIN_OK := $(shell printf 'int main(void){return 0;}' > /tmp/.sifaros-probe.c 2>/dev/null && \
                  $(CC) -m32 -ffreestanding -nostdlib -c /tmp/.sifaros-probe.c \
                        -o /tmp/.sifaros-probe.o >/dev/null 2>&1 && echo yes)

toolchain:
ifneq ($(TOOLCHAIN_OK),yes)
	@echo "ERROR: '$(CC)' cannot compile 32-bit x86 code."
	@echo
	@echo "  macOS:          brew install i686-elf-gcc i686-elf-binutils nasm qemu"
	@echo "  Debian/Ubuntu:  sudo apt-get install build-essential gcc-multilib nasm qemu-system-x86"
	@echo "  Fedora:         sudo dnf install gcc glibc-devel.i686 nasm qemu-system-x86 make"
	@echo
	@echo "The build picks up i686-elf-gcc automatically once it is installed."
	@exit 1
endif

all: toolchain $(IMAGE)

# ---- kernel objects --------------------------------------------------------
$(BUILD)/%.o: %.c
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -c $< -o $@

$(BUILD)/%.o: %.S
	@mkdir -p $(dir $@)
	$(AS) $(ASFLAGS) $< -o $@

apps: $(APP_ELVES)

# ---- user space objects ----------------------------------------------------
$(USER_LIB)/crt0.o: user/lib/crt0.S
	@mkdir -p $(USER_LIB)
	$(CC) -m32 -c $< -o $@

$(USER_LIB)/%.o: user/lib/%.c
	@mkdir -p $(USER_LIB)
	$(CC) $(USER_CFLAGS) -c $< -o $@

$(USER_DIR)/%.o: user/apps/%.c
	@mkdir -p $(USER_DIR)
	$(CC) $(USER_CFLAGS) -c $< -o $@

$(USER_DIR)/%.elf: $(USER_DIR)/%.o $(LIB_OBJECTS) user/user.ld
	$(LD) -m elf_i386 -T user/user.ld -nostdlib -z noexecstack -o $@ \
		$(USER_LIB)/crt0.o $< $(USER_LIB)/sifar.o $(USER_LIB)/ui.o

# objcopy derives the symbol names from the file name, so run it in the
# directory to keep them short: _binary_hello_elf_start and friends.
$(USER_DIR)/%_blob.o: $(USER_DIR)/%.elf
	cd $(USER_DIR) && $(OBJCOPY) -I binary -O elf32-i386 -B i386 $*.elf $*_blob.o

$(KERNEL_ELF): $(OBJECTS) $(USER_BLOBS) linker.ld
	@mkdir -p $(dir $@)
	$(LD) $(LDFLAGS) -o $@ $(OBJECTS) $(USER_BLOBS)

$(KERNEL_BIN): $(KERNEL_ELF)
	$(OBJCOPY) -O binary $< $@
	@size=$$(wc -c < $@ | tr -d ' '); \
	max=$$(( $(KERNEL_SECTORS) * 512 )); \
	echo "kernel image: $$size bytes (limit $$max)"; \
	if [ $$size -gt $$max ]; then echo "ERROR: kernel too large for the reserved area"; exit 1; fi

$(BUILD)/stage1.bin: boot/stage1.asm
	@mkdir -p $(dir $@)
	$(NASM) -f bin $< -o $@

$(BUILD)/stage2.bin: boot/stage2.asm
	@mkdir -p $(dir $@)
	$(NASM) -f bin $< -o $@

# ---- filesystem ------------------------------------------------------------
# The disk carries a real SifarFS filesystem holding the applications and the
# starting contents of the home directory.
FS_IMAGE  := $(BUILD)/fs.img
FS_SIZE   := 56M

$(FS_IMAGE): tools/mkfs.py $(APP_ELVES)
	@mkdir -p $(BUILD)
	python3 tools/mkfs.py --output $@ --size $(FS_SIZE) --label SifarOS \
		--dir /apps --dir /home --dir /etc --dir /tmp --dir /docs \
		$(FS_CONTENT)

$(IMAGE): $(BUILD)/stage1.bin $(BUILD)/stage2.bin $(KERNEL_BIN) $(FS_IMAGE)
	@dd if=/dev/zero of=$@ bs=512 count=$(IMAGE_SECTORS) 2>/dev/null
	@dd if=$(BUILD)/stage1.bin of=$@ bs=512 seek=0 conv=notrunc 2>/dev/null
	@dd if=$(BUILD)/stage2.bin of=$@ bs=512 seek=1 conv=notrunc 2>/dev/null
	@dd if=$(KERNEL_BIN) of=$@ bs=512 seek=$(KERNEL_LBA) conv=notrunc 2>/dev/null
	@dd if=$(FS_IMAGE) of=$@ bs=512 seek=$(FS_LBA) conv=notrunc 2>/dev/null
	@echo "disk image: $@"

run: $(IMAGE)
	@tools/run.sh

run-serial: $(IMAGE)
	@tools/run.sh --serial

test: $(IMAGE)
	@tools/test.sh

test-gui: $(IMAGE)
	@tools/test-gui.sh

test-all: test test-gui

debug: $(IMAGE)
	@tools/run.sh --debug

shot: $(IMAGE)
	@tools/shot.sh $(BUILD)/screen.png 10

clean:
	rm -rf $(BUILD)

# Header dependencies emitted by the compiler.
DEPS := $(OBJECTS:.o=.d) $(LIB_OBJECTS:.o=.d) $(patsubst %,$(USER_DIR)/%.d,$(APPS))
-include $(DEPS)
