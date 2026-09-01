# Changelog

All notable changes to the **BLDesk** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
