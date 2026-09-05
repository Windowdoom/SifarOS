#!/usr/bin/env python3
"""Build a SifarFS filesystem image.

SifarFS is the native filesystem: a superblock, a free block bitmap, a flat
inode table and directories stored as arrays of fixed size entries.  The
kernel implementation in kernel/fs/sfs.c reads and writes exactly this layout.

    tools/mkfs.py --output build/fs.img --size 64M \
                  --add build/user/apps/files.elf:/apps/files \
                  --text /etc/motd:"welcome"
"""
import argparse
import os
import struct
import sys

MAGIC = 0x53465321          # "SFS!"
VERSION = 1
BLOCK = 4096
INODE_SIZE = 128
INODES_PER_BLOCK = BLOCK // INODE_SIZE
DIRENT_SIZE = 64
NAME_MAX = 56
DIRECT = 12
POINTERS_PER_BLOCK = BLOCK // 4

TYPE_FREE = 0
TYPE_FILE = 1
TYPE_DIR = 2

FLAG_READONLY = 1
FLAG_EXEC = 2


class Filesystem:
    def __init__(self, total_blocks, inode_count, label):
        self.total_blocks = total_blocks
        self.inode_count = inode_count
        self.label = label

        self.bitmap_start = 1
        self.bitmap_blocks = (total_blocks + BLOCK * 8 - 1) // (BLOCK * 8)
        self.inode_start = self.bitmap_start + self.bitmap_blocks
        self.inode_blocks = (inode_count + INODES_PER_BLOCK - 1) // INODES_PER_BLOCK
        self.data_start = self.inode_start + self.inode_blocks

        self.blocks = [bytearray(BLOCK) for _ in range(total_blocks)]
        self.used = bytearray(total_blocks)          # 1 = allocated
        self.inodes = [dict(type=TYPE_FREE, size=0, links=0, created=0,
                            modified=0, flags=0, direct=[0] * DIRECT, indirect=0)
                       for _ in range(inode_count + 1)]

        for block in range(self.data_start):
            self.used[block] = 1

    # -- allocation ---------------------------------------------------------
    def alloc_block(self):
        for index in range(self.data_start, self.total_blocks):
            if not self.used[index]:
                self.used[index] = 1
                return index
        raise RuntimeError("filesystem is full")

    def alloc_inode(self):
        for number in range(1, self.inode_count + 1):
            if self.inodes[number]["type"] == TYPE_FREE:
                return number
        raise RuntimeError("out of inodes")

    # -- file contents ------------------------------------------------------
    def write_data(self, inode_number, payload):
        inode = self.inodes[inode_number]
        needed = (len(payload) + BLOCK - 1) // BLOCK

        if needed > DIRECT + POINTERS_PER_BLOCK:
            raise RuntimeError("file too large for this filesystem")

        indirect_block = None
        for index in range(needed):
            block = self.alloc_block()
            chunk = payload[index * BLOCK:(index + 1) * BLOCK]
            self.blocks[block][:len(chunk)] = chunk

            if index < DIRECT:
                inode["direct"][index] = block
            else:
                if indirect_block is None:
                    indirect_block = self.alloc_block()
                    inode["indirect"] = indirect_block
                slot = index - DIRECT
                struct.pack_into("<I", self.blocks[indirect_block], slot * 4, block)

        inode["size"] = len(payload)

    def read_data(self, inode_number):
        inode = self.inodes[inode_number]
        out = bytearray()
        remaining = inode["size"]
        index = 0

        while remaining > 0:
            if index < DIRECT:
                block = inode["direct"][index]
            else:
                block = struct.unpack_from("<I", self.blocks[inode["indirect"]],
                                           (index - DIRECT) * 4)[0]
            take = min(BLOCK, remaining)
            out += self.blocks[block][:take]
            remaining -= take
            index += 1
        return bytes(out)

    # -- directories --------------------------------------------------------
    def make_directory(self, parent):
        number = self.alloc_inode()
        self.inodes[number].update(type=TYPE_DIR, links=1, size=0)
        return number

    def dir_add(self, dir_inode, name, child_inode):
        if len(name) >= NAME_MAX:
            raise RuntimeError(f"name too long: {name}")

        entries = bytearray(self.read_data(dir_inode))
        entry = struct.pack("<II", child_inode, len(name)) + \
            name.encode() + b"\0" * (NAME_MAX - len(name))
        assert len(entry) == DIRENT_SIZE

        # reuse a free slot if there is one
        for offset in range(0, len(entries), DIRENT_SIZE):
            if struct.unpack_from("<I", entries, offset)[0] == 0:
                entries[offset:offset + DIRENT_SIZE] = entry
                break
        else:
            entries += entry

        self.free_data(dir_inode)
        self.write_data(dir_inode, bytes(entries))

    def free_data(self, inode_number):
        inode = self.inodes[inode_number]
        count = (inode["size"] + BLOCK - 1) // BLOCK

        for index in range(count):
            if index < DIRECT:
                block = inode["direct"][index]
                inode["direct"][index] = 0
            else:
                block = struct.unpack_from("<I", self.blocks[inode["indirect"]],
                                           (index - DIRECT) * 4)[0]
            if block:
                self.used[block] = 0
                self.blocks[block] = bytearray(BLOCK)
        if inode["indirect"]:
            self.used[inode["indirect"]] = 0
            inode["indirect"] = 0
        inode["size"] = 0

    def resolve_directory(self, path):
        """Create every directory along path and return the final inode."""
        current = 1                     # root
        for part in [p for p in path.strip("/").split("/") if p]:
            found = None
            entries = self.read_data(current)
            for offset in range(0, len(entries), DIRENT_SIZE):
                inode_number, name_len = struct.unpack_from("<II", entries, offset)
                if inode_number == 0:
                    continue
                name = entries[offset + 8:offset + 8 + name_len].decode()
                if name == part:
                    found = inode_number
                    break
            if found is None:
                found = self.make_directory(current)
                self.dir_add(current, part, found)
            current = found
        return current

    def add_file(self, path, payload, flags=0):
        directory, _, name = path.rpartition("/")
        parent = self.resolve_directory(directory or "/")
        number = self.alloc_inode()
        self.inodes[number].update(type=TYPE_FILE, links=1, flags=flags)
        self.write_data(number, payload)
        self.dir_add(parent, name, number)
        return number

    # -- output -------------------------------------------------------------
    def serialise(self):
        free_blocks = sum(1 for byte in self.used if not byte)

        superblock = struct.pack(
            "<11I32s", MAGIC, VERSION, BLOCK, self.total_blocks,
            self.bitmap_start, self.bitmap_blocks, self.inode_start,
            self.inode_blocks, self.inode_count, 1, free_blocks,
            self.label.encode()[:31])
        self.blocks[0][:len(superblock)] = superblock

        bitmap = bytearray(self.bitmap_blocks * BLOCK)
        for index, used in enumerate(self.used):
            if used:
                bitmap[index // 8] |= 1 << (index % 8)
        for offset in range(self.bitmap_blocks):
            self.blocks[self.bitmap_start + offset] = \
                bytearray(bitmap[offset * BLOCK:(offset + 1) * BLOCK])

        for number in range(1, self.inode_count + 1):
            inode = self.inodes[number]
            packed = struct.pack("<6I12II13I", inode["type"], inode["size"],
                                 inode["links"], inode["created"],
                                 inode["modified"], inode["flags"],
                                 *inode["direct"], inode["indirect"],
                                 *([0] * 13))
            assert len(packed) == INODE_SIZE
            block = self.inode_start + (number - 1) // INODES_PER_BLOCK
            offset = ((number - 1) % INODES_PER_BLOCK) * INODE_SIZE
            self.blocks[block][offset:offset + INODE_SIZE] = packed

        return b"".join(bytes(block) for block in self.blocks)


def parse_size(text):
    text = text.strip().upper()
    if text.endswith("M"):
        return int(text[:-1]) * 1024 * 1024
    if text.endswith("K"):
        return int(text[:-1]) * 1024
    return int(text)


def main():
    parser = argparse.ArgumentParser(description="build a SifarFS image")
    parser.add_argument("--output", required=True)
    parser.add_argument("--size", default="32M")
    parser.add_argument("--label", default="SifarOS")
    parser.add_argument("--inodes", type=int, default=512)
    parser.add_argument("--add", action="append", default=[],
                        metavar="SOURCE:DEST", help="copy a host file in")
    parser.add_argument("--exec", action="append", default=[],
                        metavar="SOURCE:DEST", help="copy in and mark executable")
    parser.add_argument("--text", action="append", default=[],
                        metavar="DEST:CONTENT", help="create a file from a literal")
    parser.add_argument("--protected", action="append", default=[],
                        metavar="DEST:CONTENT",
                        help="create a read only file from a literal")
    parser.add_argument("--dir", action="append", default=[],
                        metavar="PATH", help="create an empty directory")
    args = parser.parse_args()

    total_blocks = parse_size(args.size) // BLOCK
    fs = Filesystem(total_blocks, args.inodes, args.label)

    # the root directory is inode 1
    root = fs.alloc_inode()
    assert root == 1
    fs.inodes[root].update(type=TYPE_DIR, links=1, size=0)

    for path in args.dir:
        fs.resolve_directory(path)

    for spec, flags in [(s, 0) for s in args.add] + \
                       [(s, FLAG_EXEC) for s in args.exec]:
        source, _, destination = spec.partition(":")
        with open(source, "rb") as handle:
            fs.add_file(destination, handle.read(), flags)

    for spec, flags in [(t, 0) for t in args.text] + \
                       [(t, FLAG_READONLY) for t in args.protected]:
        destination, _, content = spec.partition(":")
        fs.add_file(destination,
                    content.encode().decode("unicode_escape").encode(), flags)

    image = fs.serialise()
    with open(args.output, "wb") as handle:
        handle.write(image)

    used = sum(1 for byte in fs.used if byte)
    print(f"{args.output}: {total_blocks} blocks of {BLOCK} bytes, "
          f"{used} used, {args.inodes} inodes")


if __name__ == "__main__":
    sys.exit(main())
