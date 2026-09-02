# Changelog

All notable changes to the **BLDesk** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.41] - 2026-09-02

### Added
- **Diff-based change review and a local change log** (FEATURES.md #5):
  - **One confirm dialog for every mutation**, replacing sixteen bare `window.confirm()` boxes. It names the target, says in a sentence what will happen, shows a before → after table or a line diff where there is one (firewall rule lists, DNS records, renames, disk sizes, region moves, rebuild images), and carries warnings in amber. Destructive actions get a red button; irreversible ones (rebuild, restore, delete disk, delete VPC, delete load balancer, disable firewall) make you type the target's name. Enter confirms, Esc cancels.
  - **Firewall edits now show the diff** — adding, deleting, reordering, importing and cloning rules all preview the exact rule list that will be written, since every one of them replaces the whole set.
  - **Diagnostics no longer ask "are you sure?"** — ping, uptime and is-running change nothing.
  - **History tab**: every change confirmed in BLDesk, per account, newest first, with what was confirmed and how it ended (submitted / completed / errored / failed / lost track) as reported by the action tracker. Filter by server, action or outcome; expand for the diff; clear from the same view. Stored on this machine under `<userData>/changelog/`, never sent anywhere. Palette commands are logged too and marked with a ⚡.

---

## [1.0.40] - 2026-09-02

### Added
- **Rebuilt Create Server Form to Match mPanel Flow** (*thanks @01ax!*):
  - Restructured into three numbered sections: Location & OS, Resources & Plan, and Settings & Deployment.
  - **Distribution Tiles & Version Hierarchy**: Interactive distro tiles with greyscale-to-color transitions and versions sorted newest-first with long-term releases ahead of variants.
  - **Full Pagination for Images & Sizes**: Replaced unpaged API endpoints with `fetchAllPages`, revealing all 27 OS distributions and all 21 compute plans.
  - **Accurate Licensed Image Pricing**: Integrated OS surcharges (Windows Server per-MB memory licensing caps and cPanel flat bases) into displayed monthly totals with GST breakdown.
  - **Live Availability & Capacity Reasons**: Surfaces exact plan availability and out-of-stock reasons per region rather than failing at submission.
  - **Expandable Settings View**: Configurable VPC networking, SSH keys (with MASTER key pre-selected and inline creation), extra IPv4 addresses, backup frequencies, and cloud-init scripts.
  - **Modal Portal Rendering**: Rendered create dialog through `createPortal` into `document.body` for pristine full-viewport backdrop dimming.

---

## [1.0.39] - 2026-09-02

### Added
- **Tray / menu bar that earns its spot** (FEATURES.md #3):
  - **Live fleet counts** in the tray tooltip and menu (running / off / other / actions in progress, prepaid credit); on macOS a `↻N` title appears beside the icon only while actions are running.
  - **Servers submenu** — every server with Open in BLDesk, Copy IP and SSH as root, straight from the tray.
  - **Things that need you, surfaced**: actions BinaryLane has paused on a question (including ones started from mPanel or another machine) and invoices whose payment failed get their own menu lines that open the right view, a notification when they appear, and on macOS a `!N` beside the icon until dealt with.
  - **Native notifications** when a server changes state, appears or disappears (diffed against the first live fetch, never the local cache), when a tracked action completes, fails or pauses for a question, and when prepaid credit drops below $20 AUD or a payment fails. Each category can be muted from the tray's Settings submenu.
  - **Keep running in tray when the window is closed** (on by default, with a one-time notice the first time it hides) and **Launch at login** (macOS/Windows), both toggled from the tray.
  - **Check for updates** from the tray on packaged builds.

- **Client-side power state** (bridges vps/vps #161, open since 2022): the API's `status` never turns `off`, so BLDesk now infers power state itself. A read-only sweep every two minutes reads each server's latest performance sample; a server whose latest five-minute bucket is more than 15 minutes old is shown as Stopped. Samples are produced host-side only while the VM runs, so this also catches `sudo poweroff` inside the guest, which nothing else can see. After a power action settles, one `is_running` diagnostic asks the hypervisor directly and the toast reports "Server is off" / "Server is running" — or calls out a shutdown the OS ignored. The status pill's tooltip says where its verdict came from and what the API claims.

### Fixed
- **Server details header went stale**: the view read status from the object clicked in the list, so a server shut down from its own page kept saying "Running" until re-opened. It now follows the live server list.
- **Palette no longer gates power verbs on `active`/`off`.** The API was observed leaving a server at `active` after a completed hard power-off, so `start` would have skipped a server that was really off. Only `new` and `archive` are skipped now; BinaryLane rejects genuine no-ops and the palette reports that per target.
- **"Shutdown completed" no longer implies the server is off.** BinaryLane completes a `shutdown` action when the ACPI signal is delivered, within seconds, whether or not the OS halts. The toast and notification now say "signal sent" and point at Power off if the server stays running; the "is now off" notification remains the real confirmation.

---

## [1.0.38] - 2026-09-02

### Added
- **Verb-first Command Palette** (FEATURES.md #4): `Cmd+K` now accepts commands, not just nouns.
  - **Fleet actions with glob targets**: `restart wp-*`, `shutdown jumpbox,db-1`, `start #12345`, `cycle 43.224`, `snapshot web "pre-upgrade"`. Targets accept a name or prefix, a glob (`*`/`?`), `#id`, an IPv4 or IPv4 prefix, or a comma-separated mix.
  - **Status-aware preview**: servers that can't take the action (already off / already running) are shown as skipped with the reason, and patterns that match nothing are called out, before anything is submitted.
  - **Review step**: every mutating command shows the exact target list and needs a second `Enter` to run; submissions go one at a time and each is handed to the background action tracker, so outcomes arrive as toasts.
  - **Navigation verbs**: `ssh <server|ip>`, `console <server>`, `open <server> [network|firewall|…]`, `link <server>` (copies a `bldesk://` link), `go dns`.
  - **DNS from the keyboard**: `dns add A foo.example.com 203.0.113.9` resolves the hosted zone by longest suffix; MX/SRV require a priority.
  - **Recent commands**, verb suggestions while typing, `Tab` to fill a server name, and `?` for the full list. The old fuzzy server/tab search still works when the query doesn't start with a verb.

---

## [1.0.37] - 2026-09-02

### Fixed
- **Windows NSIS Auto-Updater Relaunch Target** (*thanks @01ax!*):
  - Configured custom NSIS installer script (`nsis/installer.nsh`) overriding `$launchLink` to target `$INSTDIR\${APP_EXECUTABLE_FILENAME}` directly instead of the Start Menu shortcut link.
  - Fixes missing shortcut error dialogs upon restart after applying auto-updates on Windows 11.
- **Linux Package Maintainer Metadata**:
  - Updated `author` in `package.json` with an explicit email address (`support@binarylane.com.au`) to satisfy Debian package control metadata requirements and enable clean Linux `.deb` packaging.

---

## [1.0.36] - 2026-09-02

### Fixed
- **Mobile Responsive Layout & Safe Area Insets**:
  - **TitleBar Mobile Uncluttering**: Resolved header overlap and colliding badges on small screens by removing duplicate version pills, making brand titles responsive, and optimizing profile selector widths.
  - **Android Status Bar & Safe Areas**: Added viewport-fit support and safe-area top/bottom insets (`pt-[env(safe-area-inset-top)]` on titlebar, `pb-[env(safe-area-inset-bottom)]` on bottom nav) to prevent Android status bar clock/icons from overlapping the UI.
  - **Horizontal Table Scrolling**: Changed server list table container from `overflow-hidden` to `overflow-x-auto` to prevent column text clipping on mobile displays.

---

## [1.0.35] - 2026-09-02

### Added
- **Full Domain List Pagination & DNS Suite** (*thanks @01ax!*):
  - **Full Multi-Page Domain Paging**: Fetches all hosted DNS zones (supporting 144+ domains) with 25-per-page client controls and live search filtering.
  - **Zone Delegation Status**: Displays **Live** vs **Not in use** status indicators by verifying domain delegation against BinaryLane authoritative nameservers.
  - **Domain Context Menu**: Right-click actions to copy domain name, copy nameservers, copy BIND zone file, or launch mPanel.
  - **Guarded Zone Deletion Modal**: Deleting DNS hosting now requires typing the domain name, shows affected record counts, and includes a 1-click zone file backup button.

### Fixed
- **Profile Vault & Key Updating** (*thanks @01ax!*):
  - **Profile Key Replacement**: Added explicit "Update key" flow to replace tokens for existing profiles without creating duplicate entries.
  - **Refuse Duplicate Name Overwrites**: Refuses saving a new profile under an existing name to prevent accidental token overwrites.
  - **Auth Error Banner Reset**: Automatically dismisses stale 401 authentication failure banners when switching to a working profile.
  - **API Token Link**: Pointed token creation link to `/api-info` (fixing 404 from `/api-tokens`).

---

## [1.0.34] - 2026-09-02

### Fixed
- **Android In-Place APK Upgrade & Keystore Signing**:
  - Replaced dynamic debug signing with a permanent, consistent Android signing keystore (`bldesk.keystore`) across all release builds.
  - Fixes Android package signature mismatch (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`), enabling seamless in-place APK upgrades without requiring an uninstall or losing account tokens and profiles.

---

## [1.0.33] - 2026-09-02

### Added
- **Android In-App Update Detection & APK Downloading**:
  - Automatically checks GitHub Releases API for newer Android APK builds on launch and on demand.
  - Compares semantic versions against `currentVersion` (`v1.0.33`).
  - Displays prominent update pill in title bar and popover with one-click **"Download APK"** button that directly grabs `BLDesk-android.apk` from GitHub Releases.
  - Supports switching between **Stable** and **Beta** update channels on mobile.

---

## [1.0.32] - 2026-09-02

### Added
- **Truthful Async Server Action Tracking & Toast Engine** (*massive props to @Freewheelin!*):
  - **4-Tier Async Architecture**: Long hypervisor operations (`rebuild`, `change_region`, `resize_disk`, `take_backup`, `restore`) no longer falsely report "complete" at queue time; they now track in the background and confirm when finished.
  - **`ActionTrackerContext` & Floating Toast Host (`ActionToasts.tsx`)**: Zero-dependency floating toast stack reporting live step descriptions (e.g. *"Backup of SYSTEM: 38.5GB of 40.0 GB (310MB/s) - less than 1 min remaining"*), completion state, or failure reasons.
  - **Adaptive Polling Cadence**: Smart polling easing (3s for first 30s → 8s up to 2m → 15s thereafter) to prevent server request spam.
  - **Operator Interaction Handling (`user_interaction_required`)**: Properly detects when an action is paused waiting for user confirmation (e.g. `allow-unclean-power-off`) and surfaces `ActionInteractionPrompt.tsx` instead of timing out.
  - **Invoice Block Detection (`blocking_invoice_id`)**: Detects actions blocked by unpaid invoices and alerts the user immediately.
- **Fixed Diagnostics & Uptime Reporting** (*thanks @Freewheelin & @01ax!*):
  - Fixed ping and uptime diagnostics by reading `result_data` and `error_message` (replacing previous permanent "in-progress" display).
  - Clarified guest ping diagnostics vs real host node uptime.

### Fixed
- **Usage Charts Scaling & 24-Hour Paging** (*thanks @01ax!*):
  - Paginates `GET /v2/samplesets` to retrieve all 288 samples for the full 24-hour window rather than dropping the last 7 hours at the 200-sample limit.
  - Fixed mixed-unit axes on Activity Overview with independent series scaling (`scaleBy="series"` vs `scaleBy="unit"`).
  - Handles absent memory reporting agents (`memory_usage_bytes === 0`) by displaying a helpful information banner linking to setup documentation rather than asserting 0 GB usage.
- **Billing Details Links** (*thanks @01ax!*):
  - Pointed "Change billing details" buttons directly to `/billing/payment-details`.

---

## [1.0.31] - 2026-09-02

### Added
- **Account Details Tab** (*thanks @01ax!*):
  - Dedicated **Account Details** tab in the sidebar displaying account metadata (`GET /v2/account`):
    - Email address with verified/unverified status badge.
    - Account status, tax code, 2FA enabled status, and additional IPv4 limits.
    - Configured payment method indicators.
    - Direct web links for password changes, API token management, 2FA setup, and contact details.
- **Tabbed Billing & Invoices Suite** (*thanks @01ax!*):
  - Reorganized the Billing interface into 3 mPanel-style tabs:
    - **Invoices**: Full server-side pagination (`page` and `per_page`) with previous/next controls, fixing previous truncation where only 20 invoices were visible.
    - **Pending Charges**: Itemized breakdown of unbilled charges (`balance.charges[]`) with descriptions, dates, status, and running totals.
    - **Payment Details**: Configured payment method status, PayPal manual payment guidance, and update links.
  - **Unpaid Invoice Alert Banner**: Prominent banner displayed when payment failed invoices require attention.

### Fixed
- **Windows Portable / NSIS Artifact Collision** (*thanks @01ax!*):
  - Assigned explicit `artifactName` for the Windows `portable` target (`BLDesk-${version}-${os}-${arch}-portable.exe`) so it no longer overwrites the NSIS installer executable during multi-target packaging.
- **Honest Auto-Updater Reporting** (*thanks @01ax!*):
  - Introduced `check-failed` status (grey *"Couldn't check"* pill with error details in dropdown) for unreachable feeds or missing manifests, preventing false green *"Up to date"* indications when update checks fail.

---

## [1.0.30] - 2026-09-02

### Added
- **Deep Links (`bldesk://`) Protocol Handler**:
  - Registered `bldesk://` OS protocol handler across Windows (Registry), macOS (`CFBundleURLTypes`), and Linux (`.desktop`).
  - Direct deep linking grammar support:
    - `bldesk://server/<id>[/<subtab>]` — Jump straight to any server and sub-tab.
    - `bldesk://console/<id>` — Launch the rescue console window directly.
    - `bldesk://ssh/<id>` — Launch native SSH terminal connection.
    - `bldesk://tab/<name>` — Open top-level navigation tabs (`vpcs`, `firewall`, `dns`, `backups`, etc.).
    - `?account=<name or email>` — Switch profile automatically before navigating.
- **Server Row Context Menu**:
  - Right-click context menu on server rows with quick actions (Open, SSH, Copy IP, Copy `bldesk://` Link, Copy Console Link, Reboot, Shutdown, Power on).
- **Copy Link Buttons**:
  - Quick copy link icon on server rows and **Copy link** button in Server Details header.
- **Documentation**:
  - Added [`docs/DEEP_LINKS.md`](docs/DEEP_LINKS.md) detailing deep link architecture, routing lifecycle, and usage.

---

## [1.0.29] - 2026-09-02

### Fixed
- **ESM / CommonJS Interoperability**: Fixed `SyntaxError: Named export 'autoUpdater' not found` by adding dynamic getter resolution for `electron-updater` in Node.js ESM.
- **Auto-Updater 404 Resilience**: Gracefully handle missing GitHub Release manifests as "Up to date" check instead of throwing uncaught UI error dialogs.
- **Windows Tray Icon**: Added `.ico` fallback for Windows notification tray initialization to prevent platform crashes.
- **Window Display Robustness**: Added `did-finish-load` fallback event listener to guarantee main window visibility on startup.

### Added
- **Prominent Version Indicators**: Display running app version (`BLDesk v1.0.X`) in the top-left titlebar header, auto-update pill, and sidebar footer.

---

## [1.0.28] - 2026-09-02

### Added
- **Cross-Platform Auto-Updates (`electron-updater`)**:
  - In-app silent background update checks every 6 hours and on launch.
  - Multi-OS GitHub Release publishing (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`, and blockmaps).
  - Title bar `UpdateMenu` with manual "Check now" button, channel selector, progress bar, and "Restart to update" pill.
  - Channel switching between **Stable** and **Beta** channels with persistent state in user configuration.
- **Developer Documentation**:
  - Added [`AGENTS.md`](AGENTS.md) and [`docs/AUTO_UPDATE.md`](docs/AUTO_UPDATE.md).

---

## [1.0.27] - 2026-09-01

### Added
- **Backup & Snapshot Downloads**:
  - Direct hypervisor disk image downloading and action tracking for snapshots.
  - Automatic rotation of oldest temporary snapshots.
- **OS Distribution Logos**:
  - Added official vector logos for AlmaLinux, Debian, Fedora, FreeBSD, KDE Neon, openSUSE, Rocky Linux, Ubuntu, Windows, and BYO.
- **Server Details Enhancements**:
  - Enhanced network, usage, settings, and metrics views.

---

## [1.0.26] - 2026-08-27

### Added
- **Terminal Launching**:
  - macOS Terminal.app and Linux emulator environment configurations.
  - Inline terminal launcher and command generation helper.
