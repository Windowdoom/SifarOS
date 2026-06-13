# SifarOS · صفر

A custom Android experience by **Sifar LLC**, designed around three commitments:
**encrypted to the brim, intentional rather than addictive, owned not rented.**

> صفر — *zero* — the point from which everything begins.

## Two paths

SifarOS ships as two coordinated tracks, because the right path depends on the
hardware you own.

### 1. SifarOS Layer (works today, $0, no flash, no root)

A no-flash transformation of a stock Android phone into the SifarOS *experience*
— minimalist launcher, dark/gold theme cues, encrypted FOSS app suite,
system-wide encrypted DNS, ~40 packages of bloat removed, scorched
notifications, greyscale shortcut.

Designed first for the **Samsung Galaxy S10e (SM-G970U/U1)** — a phone whose
bootloader is hardware-locked, so the layer is the right answer there. Works
on most modern One UI devices with light adjustment.

- 📖 [`docs/SifarOS-Layer-S10e.md`](docs/SifarOS-Layer-S10e.md) — the full
  10-step guide.
- 🛠 [`scripts/sifaros-layer-mac.sh`](scripts/sifaros-layer-mac.sh) — Mac-side
  ADB script (`apply` / `audit` / `restore`).

```bash
# On a MacBook, with the phone plugged in and USB debugging on:
git clone https://github.com/windowdoom/sifaros.git
cd sifaros
./scripts/sifaros-layer-mac.sh
```

### 2. SifarOS ROM (the eventual real OS)

A full AOSP-derived ROM where the phone boots into SifarOS instead of Android —
own boot screen, own theme, hardened kernel + `hardened_malloc`, Verified Boot,
the curated FOSS app suite preinstalled, no Google by default.

Requires an **unlockable device** (a Pixel, or an Exynos Samsung, or the
US-Snapdragon S10 family unlocked via the $100 SamPWND service). Scaffold lands
in this repo when there's a confirmed target device.

## License

Build scripts and SifarOS branding/configuration in this repo are © 2026
**Sifar LLC**; see [LICENSE](LICENSE). The Android Open Source Project that the
ROM track builds on is NOT included here and remains under its upstream
licenses; see [NOTICE](NOTICE). "Android" is a trademark of Google LLC.
