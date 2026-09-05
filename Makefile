# ============================================================================
# SifarOS build
#
#   make            build build/sifaros.img
#   make run        boot the image in QEMU with a graphical window
#   make run-serial boot headless with the console on stdio
#   make test       run the automated boot/smoke test
#   make clean
# ============================================================================

CC      := gcc
LD      := ld
AS      := gcc
NASM    := nasm
OBJCOPY := objcopy

BUILD   := build
KERNEL_ELF := $(BUILD)/kernel.elf
KERNEL_BIN := $(BUILD)/kernel.bin
IMAGE      := $(BUILD)/sifaros.img

# Disk layout, mirrored in boot/stage2.asm
STAGE2_SECTORS := 8
KERNEL_LBA     := 9
KERNEL_SECTORS := 512
IMAGE_SECTORS  := 4096          # 2 MiB disk

CFLAGS := -m32 -std=gnu11 -ffreestanding -fno-builtin -fno-stack-protector \
          -fno-pic -fno-pie -nostdlib -nostdinc -Wall -Wextra -Werror \
          -Wno-unused-parameter -O2 -g -Iinclude
ASFLAGS := -m32 -c -Iinclude
LDFLAGS := -m elf_i386 -T linker.ld -nostdlib -z noexecstack

C_SOURCES := $(shell find kernel -name '*.c' | sort)
S_SOURCES := $(shell find kernel -name '*.S' | sort)
OBJECTS   := $(patsubst %.c,$(BUILD)/%.o,$(C_SOURCES)) \
             $(patsubst %.S,$(BUILD)/%.o,$(S_SOURCES))

# ---- user space ------------------------------------------------------------
# Each program becomes a flat binary and is then wrapped in an object file so
# the kernel can carry it around and load it into ring 3 on demand.
USER_PROGRAMS := hello counter faulter
USER_DIR      := $(BUILD)/user
USER_BLOBS    := $(patsubst %,$(USER_DIR)/%_blob.o,$(USER_PROGRAMS))
USER_CFLAGS   := -m32 -std=gnu11 -ffreestanding -fno-builtin -fno-stack-protector \
                 -fno-pic -fno-pie -nostdlib -nostdinc -Wall -Wextra -Werror \
                 -Wno-unused-parameter -Os -Iinclude -Iuser

.PHONY: all clean run run-serial test debug dirs

all: $(IMAGE)

dirs:
	@mkdir -p $(BUILD)

$(BUILD)/%.o: %.c
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -c $< -o $@

$(BUILD)/%.o: %.S
	@mkdir -p $(dir $@)
	$(AS) $(ASFLAGS) $< -o $@

$(USER_DIR)/ulib.o: user/ulib.c user/ulib.h
	@mkdir -p $(USER_DIR)
	$(CC) $(USER_CFLAGS) -c $< -o $@

$(USER_DIR)/crt0.o: user/crt0.S
	@mkdir -p $(USER_DIR)
	$(CC) -m32 -c $< -o $@

$(USER_DIR)/%.o: user/%.c user/ulib.h
	@mkdir -p $(USER_DIR)
	$(CC) $(USER_CFLAGS) -c $< -o $@

$(USER_DIR)/%.elf: $(USER_DIR)/%.o $(USER_DIR)/crt0.o $(USER_DIR)/ulib.o user/user.ld
	$(LD) -m elf_i386 -T user/user.ld -nostdlib -z noexecstack -o $@ \
		$(USER_DIR)/crt0.o $< $(USER_DIR)/ulib.o

$(USER_DIR)/%.bin: $(USER_DIR)/%.elf
	$(OBJCOPY) -O binary $< $@

# objcopy derives the symbol names from the file name, so run it in the
# directory to keep them short: _binary_hello_bin_start and friends.
$(USER_DIR)/%_blob.o: $(USER_DIR)/%.bin
	cd $(USER_DIR) && $(OBJCOPY) -I binary -O elf32-i386 -B i386 $*.bin $*_blob.o

$(KERNEL_ELF): $(OBJECTS) $(USER_BLOBS) linker.ld
	@mkdir -p $(dir $@)
	$(LD) $(LDFLAGS) -o $@ $(OBJECTS) $(USER_BLOBS)

$(KERNEL_BIN): $(KERNEL_ELF)
	$(OBJCOPY) -O binary $< $@
	@size=$$(stat -c%s $@); \
	max=$$(( $(KERNEL_SECTORS) * 512 )); \
	echo "kernel image: $$size bytes (limit $$max)"; \
	if [ $$size -gt $$max ]; then echo "ERROR: kernel too large for the reserved area"; exit 1; fi

$(BUILD)/stage1.bin: boot/stage1.asm
	@mkdir -p $(dir $@)
	$(NASM) -f bin $< -o $@

$(BUILD)/stage2.bin: boot/stage2.asm
	@mkdir -p $(dir $@)
	$(NASM) -f bin $< -o $@

$(IMAGE): $(BUILD)/stage1.bin $(BUILD)/stage2.bin $(KERNEL_BIN)
	@dd if=/dev/zero of=$@ bs=512 count=$(IMAGE_SECTORS) status=none
	@dd if=$(BUILD)/stage1.bin of=$@ bs=512 seek=0 conv=notrunc status=none
	@dd if=$(BUILD)/stage2.bin of=$@ bs=512 seek=1 conv=notrunc status=none
	@dd if=$(KERNEL_BIN) of=$@ bs=512 seek=$(KERNEL_LBA) conv=notrunc status=none
	@echo "disk image: $@"

run: $(IMAGE)
	@tools/run.sh

run-serial: $(IMAGE)
	@tools/run.sh --serial

test: $(IMAGE)
	@tools/test.sh

debug: $(IMAGE)
	@tools/run.sh --debug

clean:
	rm -rf $(BUILD)
