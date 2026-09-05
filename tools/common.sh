# Shared helpers for the SifarOS scripts.
#
# Sourced, not executed. This keeps the same test tooling usable on Linux and
# macOS, where GNU timeout is either absent or installed as gtimeout.

if command -v timeout >/dev/null 2>&1; then
    TIMEOUT_CMD=timeout
elif command -v gtimeout >/dev/null 2>&1; then
    TIMEOUT_CMD=gtimeout
else
    TIMEOUT_CMD=""
fi

# run_limited <seconds> <command...>
run_limited() {
    local seconds="$1"
    shift
    if [ -n "$TIMEOUT_CMD" ]; then
        "$TIMEOUT_CMD" "$seconds" "$@"
    else
        "$@"
    fi
}
