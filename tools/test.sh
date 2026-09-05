#!/usr/bin/env bash
# Boot SifarOS in QEMU, drive the shell over the serial line, and check what
# comes back.  This is the project's end to end test: it exercises the real
# bootloader, kernel, scheduler, filesystem and ring 3 transition.
set -uo pipefail

cd "$(dirname "$0")/.."

IMAGE=${IMAGE:-build/sifaros.img}
QEMU=${QEMU:-qemu-system-i386}
MEMORY=${MEMORY:-128}
LOG=${LOG:-build/test-output.log}
BOOT_WAIT=${BOOT_WAIT:-4}
TIMEOUT=${TIMEOUT:-120}

if [ ! -f "$IMAGE" ]; then
    echo "$IMAGE not found, run make first" >&2
    exit 1
fi

mkdir -p "$(dirname "$LOG")"

# Commands are paced so the 16 byte UART FIFO never overflows.
send_commands() {
    sleep "$BOOT_WAIT"
    local commands=(
        "uname"
        "uptime"
        "mem"
        "heap"
        "ps"
        "ls /"
        "cat /etc/release"
        "mkdir /tmp/demo"
        "write /tmp/demo/notes.txt hello from the test harness"
        "append /tmp/demo/notes.txt second line"
        "cat /tmp/demo/notes.txt"
        "stat /tmp/demo/notes.txt"
        "cp /tmp/demo/notes.txt /tmp/demo/copy.txt"
        "hexdump /tmp/demo/copy.txt"
        "tree /tmp"
        "rm /tmp/demo/copy.txt"
        "ls /tmp/demo"
        "rm /etc/motd"
        "spawn 3"
        "programs"
        "run hello"
        "cat /home/hello.txt"
        "run counter"
        "run faulter"
        "echo still alive after the fault"
        "selftest"
        "ps"
        "nosuchcommand"
        "halt"
    )
    for command in "${commands[@]}"; do
        printf '%s\n' "$command"
        case "$command" in
            selftest|run\ *|spawn*) sleep 4 ;;
            *) sleep 1 ;;
        esac
    done
    sleep 3
}

# --check-only re-runs the assertions against the last captured log, which is
# handy while working on the checks themselves.
if [ "${1:-}" != "--check-only" ]; then
    echo "booting $IMAGE under $QEMU..."
    send_commands | timeout "$TIMEOUT" "$QEMU" \
        -drive "format=raw,file=$IMAGE" \
        -m "$MEMORY" \
        -display none \
        -serial stdio \
        -no-reboot \
        > "$LOG" 2>&1
fi

echo "captured $(wc -l < "$LOG") lines in $LOG"
echo

pass=0
fail=0

expect() {
    local description="$1"
    local pattern="$2"

    if grep -qE -- "$pattern" "$LOG"; then
        echo "  PASS  $description"
        pass=$((pass + 1))
    else
        echo "  FAIL  $description   (no match for: $pattern)"
        fail=$((fail + 1))
    fi
}

reject() {
    local description="$1"
    local pattern="$2"

    if grep -qE -- "$pattern" "$LOG"; then
        echo "  FAIL  $description   (unexpected match: $pattern)"
        fail=$((fail + 1))
    else
        echo "  PASS  $description"
        pass=$((pass + 1))
    fi
}

echo "checking boot..."
expect "stage 1 runs"                  "SifarOS: stage1"
expect "stage 2 runs"                  "SifarOS: stage2"
expect "protected mode is entered"     "entering protected mode"
expect "the kernel banner prints"      "a small operating system built from scratch"
expect "the CPU is identified"         "^cpu    :"
expect "the memory map is parsed"      "MiB usable"
expect "paging comes up"               "paging : enabled"
expect "the heap comes up"             "heap   : ready"
expect "the timer is programmed"       "PIT at 100 Hz"
expect "the filesystem mounts"         "ramfs mounted at /"
expect "the syscall gate installs"     "int 0x80 gate installed"
expect "the scheduler starts"          "preemptive round robin"
expect "boot finishes"                 "boot complete in"
expect "the motd is read from the fs"  "Welcome to SifarOS"
expect "the shell starts"              "SifarOS shell"

echo
echo "checking the shell..."
expect "uname reports the system"      "SifarOS 0.1.0 i386"
expect "uptime counts"                 "up 0:00:"
expect "mem reports physical memory"   "physical memory"
expect "heap integrity check passes"   "check : ok"
expect "ps lists the shell thread"     "shell"
expect "the root directory lists"      "etc/"
expect "release file reads back"       "SifarOS 0.1.0 \(i386\)"
expect "files can be written and read" "hello from the test harness"
expect "append adds a second line"     "second line"
expect "stat reports metadata"         "type     : file"
expect "hexdump prints hex"            "00000000  68 65 6c 6c 6f"
expect "tree walks the filesystem"     "notes.txt"
expect "read only files are protected" "rm: /etc/motd is read only"
expect "unknown commands are reported" "nosuchcommand: command not found"

echo
echo "checking multitasking..."
expect "worker threads run"            "\[worker 1\] pass 1"
expect "all three workers finish"      "\[worker 3\] done"

echo
echo "checking ring 3..."
expect "programs are listed"           "greets you from ring 3"
expect "hello runs in user mode"       "hello: running in ring 3"
expect "user space can compute"        "sum of 1..1000 = 500500"
expect "syscalls reach the filesystem" "read back /home/hello.txt"
expect "the exit status comes back"    "hello exited with status 7"
expect "the kernel sees the user file" "written from ring 3 by hello"
expect "counter sleeps and wakes"      "counter: tick 5 of 5"
expect "the faulting program is killed" "faulter"
expect "a user fault does not panic"   "still alive after the fault"

echo
echo "checking the self-test suite..."
expect "self-tests run"                "running kernel self-tests"
expect "no self-test failed"           "selftest: [0-9]+ checks, [0-9]+ passed, 0 failed"
reject "no check reported FAIL"        "\[FAIL\]"
reject "the kernel never panicked"     "KERNEL PANIC"

echo
echo "----------------------------------------"
echo "  $pass passed, $fail failed"
echo "----------------------------------------"

if [ "$fail" -ne 0 ]; then
    echo
    echo "last 40 lines of $LOG:"
    tail -40 "$LOG"
    exit 1
fi
