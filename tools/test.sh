#!/usr/bin/env bash
# Boot SifarOS in QEMU and drive it over the serial console.
#
# This exercises the parts a screenshot cannot: the boot sequence, the disk
# filesystem, process creation, fault isolation, the in-kernel test suite and
# whether writes actually survive a reboot. tools/test-gui.sh covers desktop.
set -uo pipefail

cd "$(dirname "$0")/.."
source tools/common.sh

IMAGE=${IMAGE:-build/sifaros.img}
QEMU=${QEMU:-qemu-system-i386}
MEMORY=${MEMORY:-512}
LOG=${LOG:-build/test-output.log}
LOG2=${LOG2:-build/test-reboot.log}
BOOT_WAIT=${BOOT_WAIT:-6}
TIMEOUT=${TIMEOUT:-240}

if [ ! -f "$IMAGE" ]; then
    echo "$IMAGE not found, run make first" >&2
    exit 1
fi

mkdir -p "$(dirname "$LOG")"

run_session() {
    local output="$1"
    shift
    local commands=("$@")

    {
        sleep "$BOOT_WAIT"
        for command in "${commands[@]}"; do
            printf '%s\n' "$command"
            case "$command" in
                selftest|exec\ *|spawn*|run\ *) sleep 5 ;;
                *) sleep 1 ;;
            esac
        done
        sleep 2
    } | run_limited "$TIMEOUT" "$QEMU" \
            -drive "format=raw,file=$IMAGE" \
            -m "$MEMORY" \
            -display none \
            -serial stdio \
            -no-reboot \
            > "$output" 2>&1
}

pass=0
fail=0

expect() {
    local description="$1" pattern="$2" file="${3:-$LOG}"

    if grep -qE -- "$pattern" "$file"; then
        echo "  PASS  $description"
        pass=$((pass + 1))
    else
        echo "  FAIL  $description   (no match for: $pattern)"
        fail=$((fail + 1))
    fi
}

reject() {
    local description="$1" pattern="$2" file="${3:-$LOG}"

    if grep -qE -- "$pattern" "$file"; then
        echo "  FAIL  $description   (unexpected: $pattern)"
        fail=$((fail + 1))
    else
        echo "  PASS  $description"
        pass=$((pass + 1))
    fi
}

echo "session 1: booting $IMAGE and working through the shell..."
run_session "$LOG" \
    "uname" \
    "mem" \
    "heap" \
    "df" \
    "ls /" \
    "ls /apps" \
    "cat /etc/release" \
    "rm /etc/motd" \
    "mkdir /home/session" \
    "write /home/session/note.txt written by the test harness" \
    "cat /home/session/note.txt" \
    "stat /home/session/note.txt" \
    "hexdump /home/session/note.txt" \
    "cp /home/session/note.txt /home/session/copy.txt" \
    "ls /home/session" \
    "windows" \
    "procs" \
    "ps" \
    "spawn 3" \
    "exec /apps/hello" \
    "cat /home/hello.txt" \
    "run faulter" \
    "echo the kernel is still alive" \
    "selftest" \
    "nosuchcommand" \
    "halt"

echo "captured $(wc -l < "$LOG") lines"
echo
echo "checking the boot sequence..."
expect "stage 1 runs"                   "SifarOS: stage1"
expect "stage 2 runs"                   "SifarOS: stage2"
expect "a graphics mode is set"         "setting graphics mode"
expect "protected mode is entered"      "SifarOS 0.2.0|a small operating system"
expect "the CPU and tables come up"     "GDT, IDT, PIC and (SSE|x87)"
expect "memory is detected"             "MiB usable"
expect "paging comes up"                "paging : enabled"
expect "the heap comes up"              "heap   : ready"
expect "the framebuffer comes up"       "video  : [0-9]+x[0-9]+ at 32 bpp"
expect "the disk is found"              "disk   : .*MiB"
expect "the filesystem mounts"          "SifarFS .* mounted at /"
expect "the syscall gate installs"      "int 0x80 gate installed"
expect "the scheduler starts"           "preemptive round robin"
expect "the desktop starts"             "desktop: started as process"

echo
echo "checking the shell and the filesystem..."
expect "uname reports the system"       "SifarOS 0.2.0 i386"
expect "memory figures are shown"       "physical memory"
expect "the heap is consistent"         "check : ok"
expect "df reports the disk"            "SifarFS"
expect "the applications are on disk"   "terminal"
expect "release file reads back"        "SifarOS 0.2.0 \(i386\)"
expect "system files are protected"     "rm: /etc/motd is read only"
expect "files can be written and read"  "written by the test harness"
expect "stat reports metadata"          "type     : file"
expect "hexdump prints hex"              "00000000  77 72 69 74 74 65 6e"
expect "files can be copied"             "copy.txt"
expect "the window list works"           "cursor : "
expect "unknown commands are reported"  "nosuchcommand: command not found"

echo
echo "checking processes..."
expect "kernel threads run"             "\[worker 1\] pass 1"
expect "all workers finish"             "\[worker 3\] done"
expect "an ELF from disk runs in ring 3" "hello: running in ring 3"
expect "user space computes"            "sum of 1..1000 = 500500"
expect "syscalls reach the filesystem"  "read back /home/hello.txt"
expect "the user heap works"            "allocated and touched 4 KiB"
expect "exit status comes back"         "exited with status 7"
expect "a faulting program is killed"   "faulter.*killed"
expect "the kernel survives it"         "the kernel is still alive"

echo
echo "checking the in-kernel test suite..."
expect "self-tests run"                 "running kernel self-tests"
expect "no self-test failed"            "selftest: [0-9]+ checks, [0-9]+ passed, 0 failed"
reject "no check reported FAIL"         "\[FAIL\]"
reject "the kernel never panicked"      "KERNEL PANIC"
reject "no stack overflowed"            "overflowed its kernel stack"

echo
echo "session 2: rebooting to see whether the disk kept the changes..."
run_session "$LOG2" \
    "ls /home/session" \
    "cat /home/session/note.txt" \
    "cat /home/hello.txt" \
    "halt"

expect "the directory survived the reboot" "note.txt" "$LOG2"
expect "the file contents survived"        "written by the test harness" "$LOG2"
expect "what ring 3 wrote survived"        "written from ring 3 by hello" "$LOG2"
reject "the second boot was clean"         "KERNEL PANIC" "$LOG2"

echo
echo "----------------------------------------"
echo "  $pass passed, $fail failed"
echo "----------------------------------------"

if [ "$fail" -ne 0 ]; then
    echo
    echo "last 30 lines of $LOG:"
    tail -30 "$LOG"
    exit 1
fi
