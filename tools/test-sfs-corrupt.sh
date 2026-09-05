#!/usr/bin/env bash
# Deliberately corrupt SifarFS metadata in disposable disk-image copies and
# verify the kernel rejects the volume instead of trusting disk-controlled
# sizes or block pointers.
set -uo pipefail

cd "$(dirname "$0")/.."
source tools/common.sh

IMAGE=${IMAGE:-build/sifaros.img}
QEMU=${QEMU:-qemu-system-i386}
MEMORY=${MEMORY:-512}
BOOT_WAIT=${BOOT_WAIT:-5}
TIMEOUT=${TIMEOUT:-30}
WORK=${WORK:-build/sfs-corrupt}
PARTITION_LBA=2048
SECTOR_SIZE=512
BLOCK_SIZE=4096

if [ ! -f "$IMAGE" ]; then
    echo "$IMAGE not found, run make first" >&2
    exit 1
fi

mkdir -p "$WORK"

mutate() {
    local case_name="$1"
    local output="$WORK/$case_name.img"

    cp "$IMAGE" "$output"
    python3 - "$output" "$case_name" "$PARTITION_LBA" "$SECTOR_SIZE" "$BLOCK_SIZE" <<'PY'
import struct
import sys

path, case, part_lba, sector, block = sys.argv[1:]
part_lba = int(part_lba)
sector = int(sector)
block = int(block)
base = part_lba * sector

with open(path, "r+b") as f:
    f.seek(base)
    superblock = bytearray(f.read(block))
    if len(superblock) != block:
        raise SystemExit("short superblock")

    fields = struct.unpack_from("<11I", superblock, 0)
    magic, version, block_size, total_blocks, bitmap_start, bitmap_blocks, \
        inode_start, inode_blocks, inode_count, root_inode, free_blocks = fields

    if case == "bitmap-overflow":
        # A value that used to overflow bitmap_blocks * 4096 in 32-bit size_t.
        struct.pack_into("<I", superblock, 20, 0x40000000)
        f.seek(base)
        f.write(superblock)
    elif case == "bad-root-pointer":
        if root_inode != 1:
            raise SystemExit("test expects root inode 1")
        # sfs_inode.direct[0] begins 24 bytes into the 128-byte inode.
        inode_offset = base + inode_start * block
        f.seek(inode_offset + 24)
        f.write(struct.pack("<I", total_blocks + 17))
    else:
        raise SystemExit(f"unknown case: {case}")
PY
}

boot_and_check() {
    local case_name="$1"
    local image="$WORK/$case_name.img"
    local log="$WORK/$case_name.log"

    {
        sleep "$BOOT_WAIT"
        printf 'halt\n'
        sleep 1
    } | run_limited "$TIMEOUT" "$QEMU" \
            -drive "format=raw,file=$image" \
            -m "$MEMORY" \
            -display none \
            -serial stdio \
            -no-reboot \
            > "$log" 2>&1

    if ! grep -q "falling back to ram" "$log"; then
        echo "FAIL $case_name: corrupted SifarFS was not rejected"
        tail -30 "$log"
        return 1
    fi
    if grep -q "KERNEL PANIC" "$log"; then
        echo "FAIL $case_name: kernel panicked while rejecting corrupted metadata"
        tail -30 "$log"
        return 1
    fi
    if ! grep -q "boot complete" "$log"; then
        echo "FAIL $case_name: kernel did not finish boot after rejecting volume"
        tail -30 "$log"
        return 1
    fi

    echo "PASS $case_name"
    return 0
}

fail=0
for case_name in bitmap-overflow bad-root-pointer; do
    mutate "$case_name" || fail=1
    boot_and_check "$case_name" || fail=1
done

exit "$fail"
