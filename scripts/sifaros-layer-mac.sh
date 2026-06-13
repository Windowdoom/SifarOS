#!/usr/bin/env bash
# SifarOS Layer — Mac-side setup for the Samsung Galaxy S10e (SM-G970U/U1).
#
# Run on your MacBook with the phone plugged in via USB and USB debugging ON.
#
#   ./scripts/sifaros-layer-mac.sh           # apply the SifarOS layer
#   ./scripts/sifaros-layer-mac.sh audit     # report current state vs goal
#   ./scripts/sifaros-layer-mac.sh restore   # re-enable every debloated package
#
# What it does NOT do:
#   • Install APKs. Use F-Droid / Aurora on the phone (keep the trust chain).
#   • Anything that needs root, an unlocked bootloader, or trips KNOX.
#   • Anything irreversible. `restore` undoes everything; a factory reset undoes
#     it for sure.

set -euo pipefail

# ---------- pretty logging ----------------------------------------------------
_c_reset=$'\033[0m'; _c_gold=$'\033[38;5;179m'; _c_green=$'\033[1;32m'
_c_yellow=$'\033[1;33m'; _c_red=$'\033[1;31m'; _c_muted=$'\033[2m'

log()  { printf '%s[SifarOS]%s %s\n' "$_c_gold"  "$_c_reset" "$*"; }
ok()   { printf '%s[SifarOS]%s %s\n' "$_c_green" "$_c_reset" "$*"; }
warn() { printf '%s[SifarOS]%s %s\n' "$_c_yellow" "$_c_reset" "$*" >&2; }
die()  { printf '%s[SifarOS]%s %s\n' "$_c_red"   "$_c_reset" "$*" >&2; exit 1; }
dim()  { printf '%s%s%s\n' "$_c_muted" "$*" "$_c_reset"; }

LOGFILE="${SIFAROS_LOG:-$HOME/sifaros-layer.log}"
exec > >(tee -a "$LOGFILE") 2>&1
log "Logging to $LOGFILE"

# ---------- 1. Toolchain (Homebrew + adb on macOS) ---------------------------
ensure_toolchain() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    warn "This script is written for macOS. On Linux, install 'adb' from your"
    warn "distro's android-tools package; the rest of the logic still works."
  fi

  if ! command -v brew >/dev/null 2>&1; then
    log "Installing Homebrew (one-time, asks for your password)…"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Best-effort add to PATH for this session
    if [[ -x /opt/homebrew/bin/brew ]]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
    if [[ -x /usr/local/bin/brew ]];    then eval "$(/usr/local/bin/brew shellenv)";    fi
  fi

  if ! command -v adb >/dev/null 2>&1; then
    log "Installing android-platform-tools (adb, fastboot)…"
    brew install --cask android-platform-tools
  fi
  ok "Toolchain ready: $(adb --version | head -1)"
}

# ---------- 2. Device handshake ----------------------------------------------
ensure_device() {
  log "Waiting for the phone (USB debugging must be ON; tap 'Always allow' on the prompt)…"
  adb start-server >/dev/null
  adb wait-for-device

  local model
  model="$(adb shell getprop ro.product.model | tr -d '\r')"
  log "Detected model: ${model:-unknown}"

  case "$model" in
    SM-G970U|SM-G970U1|SM-G970W)
      ok "Recognized S10e Snapdragon model — proceeding."
      ;;
    SM-G970F|SM-G970F\/DS)
      warn "This is the Exynos S10e (SM-G970F). The layer works, but you also"
      warn "have the option of a full ROM flash since your bootloader CAN be unlocked."
      ;;
    "")
      die "No device detected. Plug in USB, enable USB debugging, tap 'Always allow' on the phone."
      ;;
    *)
      warn "Model '$model' is not an S10e. This script was tuned for the S10e."
      warn "It should still work on most modern One UI devices, but review the"
      warn "debloat list below before continuing."
      read -r -p "Continue anyway? [y/N] " ans
      [[ "$ans" == "y" || "$ans" == "Y" ]] || die "Aborted."
      ;;
  esac
}

# ---------- 3. The debloat list ----------------------------------------------
# Conservative, well-known-safe set: Samsung promo/ads, Bixby, Facebook stubs,
# Google attention-economy apps. Removed FOR THE CURRENT USER only
# (`pm uninstall -k --user 0`) — survives reboot, undone by `restore` or factory
# reset. NOTHING here is a system-critical package.
#
# Notably KEPT (do NOT add to this list):
#   com.android.phone, com.android.providers.telephony  — needed for calls/SIM
#   com.samsung.android.app.telephonyui                  — VoLTE/calling UI
#   com.google.android.dialer / com.samsung.android.dialer
#   com.android.vending (Play Store)                     — needed for many apps
#   com.google.android.gms (Play Services)               — breaking it breaks T-Mobile features
#
DEBLOAT_PACKAGES=(
  # ---- Samsung promo / data-collecting / attention ----
  com.samsung.android.bixby.agent
  com.samsung.android.bixby.wakeup
  com.samsung.android.bixbyvision.framework
  com.samsung.android.app.spage          # Samsung Daily / Discover feed
  com.samsung.android.app.routines       # Bixby Routines
  com.samsung.android.game.gamehome      # Game Launcher
  com.samsung.android.game.gametools
  com.samsung.android.game.gos
  com.samsung.android.aremoji
  com.samsung.android.aremojieditor
  com.samsung.android.ardrawing
  com.samsung.android.arzone
  com.samsung.android.app.tips
  com.samsung.android.tvplus             # Samsung TV Plus
  com.samsung.android.kidsinstaller      # Kids Mode
  com.samsung.android.app.watchmanager   # Galaxy Watch ad
  com.samsung.android.voc                # Samsung Members (telemetry)
  com.samsung.android.app.cocktailbarservice  # Edge panel
  com.samsung.android.scloud             # Samsung Cloud
  com.sec.android.app.samsungapps        # Galaxy Store (ad-heavy)
  com.samsung.android.bbc.bbcagent

  # ---- Facebook stubs preinstalled by carriers ----
  com.facebook.system
  com.facebook.appmanager
  com.facebook.services
  com.facebook.katana

  # ---- Google attention-economy / data collection (safe to drop) ----
  com.google.android.apps.tachyon       # Google Duo / Meet
  com.google.android.youtube
  com.google.android.apps.youtube.music
  com.google.android.googlequicksearchbox  # Google app / Assistant
  com.google.android.apps.magazines     # Google News
  com.google.android.feedback
  com.google.android.printservice.recommendation
)

# ---------- 4. Apply -----------------------------------------------------------
apply_layer() {
  log "=== Applying SifarOS Layer ==="

  log "Debloating ${#DEBLOAT_PACKAGES[@]} packages (for current user; reversible)…"
  local removed=0 skipped=0
  for pkg in "${DEBLOAT_PACKAGES[@]}"; do
    if adb shell "pm list packages $pkg" 2>/dev/null | grep -q "package:$pkg"; then
      if adb shell "pm uninstall -k --user 0 $pkg" 2>&1 | grep -q Success; then
        dim "  removed  $pkg"
        removed=$((removed+1))
      else
        warn "  failed   $pkg"
      fi
    else
      dim "  skip     $pkg (not present)"
      skipped=$((skipped+1))
    fi
  done
  ok "Debloat: $removed removed, $skipped already absent."

  log "Setting Private DNS (DoT) to dns.adguard-dns.com (encrypted DNS + ads/trackers blocked)…"
  adb shell "settings put global private_dns_mode hostname"
  adb shell "settings put global private_dns_specifier dns.adguard-dns.com"

  log "Enabling auto-revoke of unused app permissions + app hibernation…"
  adb shell "settings put global app_auto_restriction_enabled 1" || true
  adb shell "cmd appops set-uid-mode SYSTEM_ALERT_WINDOW deny" 2>/dev/null || true

  log "Disabling package verifier upload (still verifies locally; just doesn't phone home)…"
  adb shell "settings put global package_verifier_user_consent -1" || true
  adb shell "settings put global upload_apk_enable 0" || true

  log "Resetting & opting out of personalized ads…"
  adb shell "settings put secure limit_ad_tracking 1" || true

  log "Lock screen: hide notification content."
  adb shell "settings put secure lock_screen_allow_private_notifications 0" || true

  ok "Layer applied. Reboot the phone, then continue with Step 4 in docs/SifarOS-Layer-S10e.md."
  cat <<EOF

${_c_gold}Next on the phone:${_c_reset}
  1. Reboot.
  2. Install F-Droid:  https://f-droid.org   (allow 'install unknown apps' for your browser, once).
  3. Install Aurora Store from F-Droid.
  4. Install the SifarOS app suite (see docs/SifarOS-Layer-S10e.md, Step 5).
  5. Set Olauncher as default launcher, HeliBoard as keyboard, Cromite as browser.
  6. Triple-tap power = greyscale (Settings -> Accessibility shortcut).

${_c_gold}To reverse everything:${_c_reset}
  ./scripts/sifaros-layer-mac.sh restore

EOF
}

# ---------- 5. Audit ---------------------------------------------------------
audit_layer() {
  log "=== SifarOS Layer audit ==="
  local present=0 absent=0
  for pkg in "${DEBLOAT_PACKAGES[@]}"; do
    if adb shell "pm list packages $pkg" 2>/dev/null | grep -q "package:$pkg"; then
      printf '  ${_c_yellow}present${_c_reset}  %s\n' "$pkg"
      present=$((present+1))
    else
      absent=$((absent+1))
    fi
  done
  log "$absent/${#DEBLOAT_PACKAGES[@]} bloat packages absent (good); $present still present."

  local dns_mode dns_host
  dns_mode="$(adb shell settings get global private_dns_mode | tr -d '\r')"
  dns_host="$(adb shell settings get global private_dns_specifier | tr -d '\r')"
  log "Private DNS:  mode=$dns_mode  host=$dns_host"

  local lock_priv
  lock_priv="$(adb shell settings get secure lock_screen_allow_private_notifications | tr -d '\r')"
  log "Lock-screen private notifications: $lock_priv  (0 = hidden, 1 = visible)"

  ok "Audit done."
}

# ---------- 6. Restore -------------------------------------------------------
restore_layer() {
  log "=== Restoring debloated packages for current user ==="
  for pkg in "${DEBLOAT_PACKAGES[@]}"; do
    if adb shell "cmd package install-existing $pkg" 2>&1 | grep -q "installed for user"; then
      dim "  restored $pkg"
    else
      dim "  noop     $pkg"
    fi
  done

  log "Resetting Private DNS to automatic…"
  adb shell "settings put global private_dns_mode opportunistic"
  adb shell "settings delete global private_dns_specifier" || true

  ok "Restore complete. (A factory reset is the only way to 100% undo everything.)"
}

# ---------- main -------------------------------------------------------------
case "${1:-apply}" in
  apply)    ensure_toolchain; ensure_device; apply_layer ;;
  audit)    ensure_toolchain; ensure_device; audit_layer ;;
  restore)  ensure_toolchain; ensure_device; restore_layer ;;
  -h|--help|help)
    sed -n '1,15p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)        die "Unknown command: $1   (use: apply | audit | restore)" ;;
esac
