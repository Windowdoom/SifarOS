# SifarOS Layer for the Samsung Galaxy S10e (SM-G970U/U1)

A free, no-root, no-flash transformation of a stock One UI S10e into an
**encrypted, intentional, non-doomscrolling daily driver**. This is the SifarOS
*experience* delivered as a layer — launcher, theme, encrypted FOSS app suite,
network privacy, debloat — without flashing the OS.

> Why a layer and not a ROM? The SM-G970U/U1 bootloader is locked at the
> hardware level. A real flashed SifarOS ROM on this device requires the $100
> SamPWND unlock service. This guide costs **$0** and runs on the phone you own
> today.

---

## What you get

- **Encrypted by default** — file-based encryption (on out of the box) keyed to
  a strong alphanumeric passphrase you set in Step 2.
- **Secure Folder** for anything sensitive — a separately encrypted enclave.
- **System-wide encrypted DNS** (DNS-over-TLS) blocking ads and trackers in
  every app, no VPN needed for the basic case.
- **The صفر / "nothing by default" launcher** (Olauncher / Niagara) — no grid of
  dopamine icons, no widgets shouting for attention.
- **A curated FOSS app suite** — Molly, FairEmail, KeePassDX, Aegis, Cromite,
  F-Droid, Aurora, Orbot, OsmAnd, HeliBoard, OpenCamera, Aves Libre.
- **~40 Samsung + Google bloat packages removed** (no root; uninstalled for the
  current user via ADB — survives reboot, reversible by factory reset).
- **Notifications scorched** — only essentials can interrupt.
- **Greyscale shortcut** — triple-tap the power button toggles monochrome to
  kill the dopamine hooks on Instagram/TikTok in a day.

What you give up: Samsung Pay (works fine, but you're consciously stepping back
from it); some Google convenience; the dopamine loop. That's the point.

---

## Step 0 — Decide what role this phone plays

This is the only step that isn't technical. **The S10e is your intentional
device.** Not your social phone, not your banking phone. If you have an iPhone
13 too, that stays the "real-world" device (and replace its battery for $89 —
genuinely cheaper than a new phone). The S10e becomes:

- The phone you reach for when you want to **not** doomscroll.
- The phone that holds your encrypted vault, your messaging, your reading.
- The phone with no Instagram/TikTok/X installed at all (or walled off in
  Shelter — see Step 7).

Make this decision before starting. Half-measures don't survive contact with
boredom.

---

## Step 1 — Prep the phone (5 minutes, on the phone)

1. **Back up everything** you can't lose. Samsung Smart Switch to a computer is
   the path of least pain.
2. **Update to the latest One UI** (Settings → Software update). Stay on the
   shipping firmware family — don't sideload random firmware.
3. **Enable Developer Options**: Settings → About phone → Software information
   → tap "Build number" 7 times.
4. **Enable USB debugging**: Settings → Developer options → USB debugging → on.
5. **Set "Default USB configuration" to "File Transfer"** (same screen).
6. **Charge to 50%+** before the ADB session.

---

## Step 2 — Set the encryption passphrase that matters

File-Based Encryption is already on. The strength of your at-rest encryption is
the strength of this passphrase.

- Settings → Lock screen → Screen lock type → **Password**.
- Pick a **long alphanumeric passphrase** (15+ characters, mix of words). Not
  6-digit PIN. Not pattern. Not fingerprint as primary.
- Settings → Lock screen → Secure lock settings → **Auto factory reset = on**
  (wipes after 10–15 wrong attempts).
- Same screen: **Show notifications on lock screen → Hide content**.

Biometric is OK for *convenience unlocks* but the **passphrase is asked after
reboot and after lock for 4+ hours** — that's the moment the encryption is
actually protecting you against a seized device. Keep it strong.

---

## Step 3 — Plug into your MacBook and run the SifarOS Layer script

On the MacBook, with the phone plugged in and USB debugging on:

```bash
# Clone this repo on the MacBook (NOT inside the SifarOS build container)
git clone https://github.com/windowdoom/sifaros.git
cd sifaros
./scripts/sifaros-layer-mac.sh
```

What the script does, in order:
1. Installs **Homebrew** (if missing) and **android-platform-tools** (gives you `adb`).
2. Authorizes the phone (you'll see a prompt on the S10e — tap "Always allow").
3. Confirms it's an SM-G970U/U1 before doing anything destructive.
4. **Debloats** ~40 Samsung + Google packages for the current user (Bixby,
   Samsung Daily, Galaxy Store ads, Facebook stubs, Google News, etc.).
5. Sets **Private DNS** to `dns.adguard-dns.com` (DoT — encrypted, blocks
   ads/trackers system-wide).
6. Enables **auto-revoke unused app permissions** and **app hibernation**.
7. Disables **package verifier** *upload* (still verifies locally; just doesn't
   phone home).
8. Disables **personalized ads** (Google ad ID reset + opt-out).
9. Sets minimal lock-screen notification visibility.

The script is **idempotent** (safe to re-run), **logs every change** to
`~/sifaros-layer.log`, and **prints a single command** at the end that reverses
everything in case you change your mind.

---

## Step 4 — Install F-Droid + Aurora (manual, 5 minutes)

Don't let any script auto-fetch APKs for you — keep the trust chain clean.

1. On the phone, in any browser, go to **https://f-droid.org** → download the
   APK → install. (You'll need to allow "Install unknown apps" for the browser
   once.)
2. Open F-Droid → Settings → Repositories → **enable "F-Droid"** and
   **"IzzyOnDroid"** (the latter has Cromite, Molly, Aurora).
3. In F-Droid, install: **Aurora Store** (anonymous Play Store client for the
   handful of apps not on F-Droid).

---

## Step 5 — Install the SifarOS app suite (manual, from F-Droid)

| Role | App | Repo | Why |
|---|---|---|---|
| **Launcher** | **Olauncher** *(text-only, calm)* or **Niagara Launcher** *(via Aurora)* | F-Droid / Aurora | No grid. No widgets. The home screen becomes quiet. |
| **Messaging** | **Molly** *(Signal fork w/ at-rest encryption)* | IzzyOnDroid | E2EE + extra hardening over plain Signal. |
| **Email** | **FairEmail** | F-Droid | OpenPGP, S/MIME, blocks tracking pixels. |
| **Browser** | **Cromite** | IzzyOnDroid | De-Googled Chromium with strong ad/tracker blocking. |
| **Search** (default in Cromite) | **DuckDuckGo** | — | No profile, no tracking. |
| **Passwords** | **KeePassDX** | F-Droid | Offline encrypted vault. Sync the `.kdbx` via Syncthing. |
| **2FA** | **Aegis Authenticator** | F-Droid | Encrypted TOTP vault, exportable. |
| **Sync** | **Syncthing** | F-Droid | P2P file sync — KeePass vault, notes, photos. |
| **VPN/mesh** | **Tailscale** *(Aurora)* + **Orbot** *(F-Droid)* | — | Tailscale = private mesh to your other nodes. Orbot = Tor when you need it. |
| **Maps** | **OsmAnd~** or **Organic Maps** | F-Droid | Offline maps, no Google. |
| **Keyboard** | **HeliBoard** or **FlorisBoard** | F-Droid | FOSS keyboards. **Gboard sees every keystroke** — switch. |
| **Camera** | **OpenCamera** | F-Droid | Strips EXIF/GPS metadata by default. |
| **Gallery** | **Aves Libre** | F-Droid | Local, no cloud. Sensitive photos go in Secure Folder. |
| **Files** | **Material Files** | F-Droid | Clean FOSS file manager. |
| **Notes** | **Obsidian** *(Aurora)* or **Standard Notes** *(Aurora)* | — | Markdown vault (Obsidian, local) or E2EE notes (Standard Notes). |
| **PDF/Books** | **Librera** | F-Droid | For the Clinical-shelf use case in the future. |
| **Podcasts** | **AntennaPod** | F-Droid | Offline-first, no telemetry. |
| **App-walling** | **Shelter** | F-Droid | Walls off any "social/distracting" app in a work profile, one-tap pause. |

**Set Cromite (or Mull) as default browser, HeliBoard as default keyboard,
Olauncher as default launcher.**

---

## Step 6 — The anti-doomscroll switches

These are tiny and change everything.

1. **Greyscale shortcut**: Settings → Accessibility → Interaction & dexterity →
   Accessibility shortcut → enable **"Color adjustment"** with greyscale preset.
   Now triple-tap the power button to toggle mono. Use it whenever you catch
   yourself scrolling.
2. **Scorched notifications**: Settings → Notifications → App notifications →
   **block all**. Then re-enable, one at a time, **only** for: Phone, Messages,
   Signal/Molly, Calendar, Maps. Nothing else interrupts.
3. **Disable Always-On Display, Edge Lighting, Edge Panels, Bixby**.
4. **Wallpaper**: solid `#0C0A0E` (SifarOS background). No personality, no hook.
5. **Settings → Battery → Adaptive Power Saving = off**, **Background usage
   limits → Sleeping apps**: aggressively add every non-essential app.

---

## Step 7 — Wall off the social apps (if you must have them)

Install **Shelter** (F-Droid). It creates an Android work profile —

- Apps inside Shelter cannot see contacts, photos, or files in your main profile.
- One-tap "Pause work apps" disables Instagram/TikTok/X system-wide until you
  unpause.
- Use it for: Instagram, TikTok, X, Reddit, Discord, anything in that category.

Best: don't install them at all. Second best: Shelter them.

---

## Step 8 — Network privacy (no VPN required for the base case)

The script in Step 3 already set **Private DNS (DoT)** to AdGuard. Confirm:

- Settings → Connections → More connection settings → **Private DNS** →
  "Private DNS provider hostname" → **`dns.adguard-dns.com`**.
- For finer control, sign up for a free **NextDNS** account and use your own
  hostname (lets you see what's being blocked, customize blocklists, get
  per-device stats).

Always-on VPN slot (optional):
- Tailscale = your private mesh to your home node / other devices.
- Mullvad (~$5/mo) = real anonymity VPN when you need it (no logs, no email).
- Set Settings → Connections → More → VPN → ⚙ on your VPN → **Always-on VPN**
  + **Block connections without VPN**.

---

## Step 9 — Encrypted backups

The vault gets one job: survive a lost/stolen/bricked phone.

- **Syncthing** between phone and a laptop/home node → continuously syncs
  your KeePass `.kdbx`, your Obsidian vault, your photos.
- The destination on the laptop should itself be on encrypted storage (FileVault
  on the Mac; LUKS on Linux).
- For one-shot encrypted exports, **Cryptomator** (F-Droid) makes a
  passphrase-encrypted vault you can dump anywhere (microSD, Google Drive, USB).

---

## Step 10 — Live with it for two weeks, then audit

The first week the phone will feel "boring." That's the system working as
designed. After two weeks:

- Settings → Battery → Battery usage. Anything you don't recognize in the top
  20? Investigate, debloat further.
- Settings → Privacy → Permission manager. Anything still has location,
  microphone, contacts access it doesn't need? Revoke.
- Run `./scripts/sifaros-layer-mac.sh audit` (with the phone plugged in) to
  diff current installed packages against a known-good list.

---

## Reverting

```bash
./scripts/sifaros-layer-mac.sh restore     # re-enables every debloated package
```

Or a factory reset returns the phone to stock One UI. Nothing here is
irreversible. Nothing trips KNOX.

---

## What's not in this guide (and why)

- **`hardened_malloc`**, hardened kernel, Verified Boot with your own keys,
  per-app network/sensor toggles — **need a flashed ROM**. The S10e SM-G970U
  needs the $100 SamPWND unlock first. See `docs/SifarOS-ROM-Roadmap.md` for
  when you're ready to go further.
- **Microg / aurora-services full Google replacement** — possible on stock but
  fiddly without root and risks breaking T-Mobile VoLTE. Not worth it for the
  layer; worth it for the ROM.
- **Banking apps** — many will refuse to run if SafetyNet/Play Integrity sees
  the debloat as "compromised." Keep banking on the iPhone 13.

---

## The point

This isn't half the project. This is a complete, intentional, encrypted phone —
built out of free parts, on a phone that's hardware-locked from going further.
It captures most of the *daily-feel* of SifarOS: calm, owned, deliberate, quiet.
When you're ready for the ROM, the launcher/apps/habits you built here carry
straight over.

صفر — the point from which everything begins.
