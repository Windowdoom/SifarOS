# Shared helpers for the SifarOS scripts.
#
# Sourced, not executed.  Everything here exists so the same scripts work on
# Linux and on macOS, where several of the usual GNU tools are missing or
# carry a g prefix from Homebrew coreutils.

if command -v timeout >/dev/null 2>&1; then
    TIMEOUT_CMD=timeout
elif command -v gtimeout >/dev/null 2>&1; then
    TIMEOUT_CMD=gtimeout
else
    TIMEOUT_CMD=""
fi

# run_limited <seconds> <command...>
# Applies a time limit when the system has one, and just runs the command
# when it does not.  Every session here ends by telling the machine to quit,
# so the limit is a backstop rather than the normal exit path.
run_limited() {
    local seconds="$1"
    shift
    if [ -n "$TIMEOUT_CMD" ]; then
        "$TIMEOUT_CMD" "$seconds" "$@"
    else
        "$@"
    fi
}
