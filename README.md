# BLDesk (BinaryLane Desktop) ⚡

[![Cross-Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Android-blue.svg)](#platform-support)
[![Electron](https://img.shields.io/badge/Electron-33+-47848F?logo=electron&logoColor=white)](#tech-stack)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-3178C6?logo=typescript&logoColor=white)](#tech-stack)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](#tech-stack)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?logo=tailwind-css&logoColor=white)](#tech-stack)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0.4-6BA539?logo=openapi-initiative&logoColor=white)](#api-coverage)

A modern, high-performance, cross-platform desktop management client for [BinaryLane Cloud](https://www.binarylane.com.au), designed to match the look and feel of BinaryLane's **mPanel**, multi-account token vaults, and desktop native capabilities.

---

## What you can do

BLDesk brings BinaryLane account management together with fleet-wide views and local desktop tools. Features below are implemented in the current source; [FEATURES.md](FEATURES.md) separates the inventory from the roadmap.

- **Manage a fleet:** grid/list views, filters, server controls and one active account profile at a time.
- **See the whole network:** regional/VPC topology, load-balancer backends and firewall-derived exposure, with SVG/PNG export.
- **Compare utilisation:** a sortable fleet heatmap plus per-server CPU, memory, storage and network history.
- **Review firewall changes:** ordered IPv4 rules, a fleet matrix, audit flags, local tags/groups and per-target diffs when copying rulesets.
- **Build repeatably:** whole-server YAML templates, built-in starters, variables and capture from an existing server, followed by the Create Server review.
- **Change plans deliberately:** resources, licences, backup/offsite options, pre-action backup, monthly-cost comparison and explicit review of address releases or reinstall.
- **Recover and inspect:** on-demand backups, slot/replacement selection, restore, read-only backup attachment, download links and nightly schedule controls.
- **Work quickly:** a verb-first command palette with glob/ID/IP/tag targets, desktop TCP reachability/traceroute and server/help deep links.
- **Keep SSH in context:** persistent desktop terminal tabs, scrollback search, optional reopen after restart and reviewed parallel broadcast commands with per-host output and History. Native SSH remains an explicit alternative.
- **Follow outcomes:** page-action confirmation dialogs, change tables/diffs, typed irreversible confirmations, local per-profile History and running-action tracking.
- **Manage account resources:** hosted DNS zones and record add/delete, SSH public keys, VPC membership, load-balancer pools, account details and billing.
- **Keep guidance close:** 33 bundled help pages, contextual links and Ask BinaryLane answers with source articles. Local help remains usable offline.
- **Use desktop conveniences:** light/dark themes, 80–150% zoom, tray shortcuts/notifications and update channels; Android uses a Capacitor shell and native HTTP.

The palette has its own target-list review; Create Server uses its form. Embedded SSH is desktop-only and requires OpenSSH on PATH (Windows 10 1903+ for ConPTY); Android retains SSH-app handoff. DNS editing, VPC route editing and load-balancer health-check configuration are not exposed in this client; see [implemented boundaries](FEATURES.md#important-boundaries). Secure credential storage has fallback paths, so a protected device remains important.

## Screenshots

Real BLDesk, populated entirely with a fictional **Atlas Cloud demo fleet**: 18 servers across Sydney, Brisbane and Melbourne, three VPCs and three load balancers. Names, addresses, metrics, balances and backup records are synthetic. No live account was used. [Capture recipe and source checks](docs/SHOWCASE.md).

### Fleet dashboard
![BLDesk dark-mode fleet dashboard with synthetic multi-region servers](docs/screenshots/dashboard-dark.png)

### Network topology
![BLDesk network map showing three demo VPCs and load-balanced application tiers](docs/screenshots/network-map-dark.png)

### Fleet utilisation
![BLDesk fleet heatmap comparing synthetic CPU, memory, disk, network and IO metrics](docs/screenshots/heatmap-dark.png)

### Firewall matrix
![BLDesk light-mode fleet firewall matrix with synthetic rules and audit results](docs/screenshots/firewall-light.png)

### Backup recovery
![BLDesk backups for a fictional database server](docs/screenshots/backups-light.png)

<details>
<summary>More: templates, performance history and built-in help</summary>

![BLDesk built-in server templates](docs/screenshots/templates-dark.png)
![BLDesk performance history with synthetic samples](docs/screenshots/usage-showcase-dark.png)
![BLDesk bundled firewall guide](docs/screenshots/help-dark.png)

</details>

---

## ⌨️ Useful Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Cmd + K` / `Ctrl + K` | Open Command Palette (search servers, VPCs, actions) |
| `Cmd/Ctrl + +` / `Cmd/Ctrl + -` | Zoom in / out (80–150%; `Cmd/Ctrl + =` also zooms in) |
| `Cmd/Ctrl + 0` | Reset zoom to 100% |
| `Cmd/Ctrl + F` inside SSH | Find in terminal scrollback |
| `Cmd + R` / `F5` | Refresh & reload current view |
| `Cmd + Option + I` / `F12` | Toggle Developer Tools Inspector |

Desktop zoom is also available in the **View** menu (press `Alt` to reveal the menu on Windows/Linux). At larger zoom levels, navigation can switch to the compact layout; use the menu button or **More** to reach every section.

Open **Help** in the sidebar or click a page's circled **?** for bundled BLDesk documentation. In the palette, `?` lists commands, `help firewall` searches local topics, and `ask how do I enable ipv6` searches BinaryLane's published articles. Local results work offline; remote questions send only the search-box text, so leave account details and secrets out. The documentation source is [docs/help](docs/help), bundled with each app version.

---

## 📥 Install

Installers are attached to the [latest release](https://github.com/termau/bldesk/releases/latest). A beta is published as a full release, so the latest release can be a beta build (see [docs/AUTO_UPDATE.md](docs/AUTO_UPDATE.md)).

### Windows

1. Download `BLDesk-<version>-win-x64.exe` from the latest release.
2. Run it.
3. The builds are not code-signed, so Windows SmartScreen warns about the installer. If you downloaded it from the releases page above, approve the warning to continue.

`BLDesk-<version>-win-x64-portable.exe` runs without installing, but it does not update itself.

### Linux (Ubuntu and Debian)

**From the release.** Download `BLDesk-<version>-linux-amd64.deb`, then install it from the folder you saved it in:

```bash
sudo apt install ./BLDesk-<version>-linux-amd64.deb
```

The package adds the `bldesk` command and an AppArmor profile that lets BLDesk's Chromium sandbox start on Ubuntu 23.10 and later. Start BLDesk from the application menu or run `bldesk`.

If the `.deb` is in a folder the `_apt` user cannot read, such as your home folder, apt prints `Download is performed unsandboxed as root`. It is a notice, not an error, and the install still completes.

**From source.** You need:

* `git`
* [Node.js](https://nodejs.org/en/download) 22, the version CI builds with. Install it from nodejs.org. Do not use Ubuntu's `nodejs` package: on Ubuntu 26.04 (22.22.1) it is built without the TypeScript support the build scripts use (`node --experimental-strip-types`), and the build stops with `ERR_NO_TYPESCRIPT`.
* A C/C++ compiler, `make` and Python 3: `sudo apt install build-essential python3`. `node-pty` has no prebuilt Linux binary, so `npm ci` compiles it.

```bash
git clone https://github.com/termau/bldesk.git
cd bldesk
npm ci
npm run build:linux
sudo apt install ./release/BLDesk-*-linux-amd64.deb
```

`npm run build:linux` writes a `.deb` and an AppImage to `release/`. To replace a release build with the one you built, run `sudo apt remove bldesk` first. Removing the package does not delete your saved profiles, which are stored in your home folder.

### macOS and Android

The macOS `.dmg` and `BLDesk-android.apk` are attached to the same releases. The macOS build is not signed or notarised, so macOS may warn about it; see Troubleshooting in the in-app Help.

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org) 22 (the version CI uses). On Ubuntu, see [Linux (Ubuntu and Debian)](#linux-ubuntu-and-debian) for why Ubuntu's `nodejs` package does not work.
* [npm](https://npmjs.com)

### Installation & Development
```bash
# Clone the repository
git clone https://github.com/termau/bldesk.git
cd bldesk

# Install dependencies
npm install

# Start local development server (with HMR)
npm run dev
```

### Packaging & Builds

```bash
# Build macOS application (.app, .dmg, .zip)
npm run build:mac

# Build Windows installer & portable package
npm run build:win

# Build Linux AppImage & deb
npm run build:linux
# Linux users: prefer the .deb on Ubuntu 23.10+/24.04 — the AppImage runs there
# too, but without the Chromium sandbox (AppArmor blocks user namespaces, and a
# setuid helper can't live inside a FUSE mount). AppImages also need libfuse2.

# Sync and prepare Android Capacitor build
npm run cap:sync
```

### 🚀 Cutting a New Release (with Auto-Update)

BLDesk supports cross-platform in-app auto-updating via `electron-updater` and GitHub Releases:

```bash
# 1. Bump version
npm version patch --no-git-tag-version

# 2. Commit and tag (tag must match version)
git commit -am "chore(release): v1.0.X"
git tag v1.0.X

# 3. Push commit & tag to trigger CI release workflow
git push && git push --tags
```

For more in-depth architectural and agent instructions, see [AGENTS.md](AGENTS.md) and [docs/AUTO_UPDATE.md](docs/AUTO_UPDATE.md).

---

## 🛠️ Architecture & Tech Stack

* **Runtime**: Electron + Node.js
* **Bundler**: `electron-vite` + `electron-builder`
* **Frontend**: React 18 + TypeScript + Tailwind CSS + Lucide Icons
* **Data Fetching**: TanStack Query v5 (React Query) with custom anti-spam client
* **Auto-Update**: `electron-updater` with multi-OS GitHub Release manifests
* **API Schema**: Strongly-typed OpenAPI fetch client generated from BinaryLane OpenAPI 3.0.4
* **Terminal**: `xterm.js` + `xterm-addon-fit` + `xterm-addon-web-links`
* **Mobile / Touch**: Capacitor for Android mobile deployments

---

## 📄 License
MIT © Mammoth Media Pty Ltd. See [LICENSE](LICENSE). The licences of the third-party packages BLDesk bundles are in `THIRD_PARTY_NOTICES.txt`, which the build generates and ships with the app.
