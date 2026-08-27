# BLDesk (BinaryLane Desktop) ⚡

[![Cross-Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)](#platform-support)
[![Electron](https://img.shields.io/badge/Electron-35+-47848F?logo=electron&logoColor=white)](#tech-stack)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](#tech-stack)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](#tech-stack)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?logo=tailwind-css&logoColor=white)](#tech-stack)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0.4-6BA539?logo=openapi-initiative&logoColor=white)](#api-coverage)

A modern, high-performance, cross-platform desktop management application for [BinaryLane Cloud](https://www.binarylane.com.au).

BLDesk brings complete **mPanel Web Console** feature parity into a fast native desktop client, enriched with desktop-exclusive features like **System Tray live monitoring**, **Command Palette navigation (`Cmd+K`)**, **Native SSH & embedded terminal**, **hardware-encrypted token storage (`safeStorage`)**, and **offline search**.

---

## ✨ Key Features

* **⚡ Compute & 42 Server Actions**: Real-time server grid & list views, power on/off, reboot, graceful shutdown, resize, rebuild, rescue mode, and disk management.
* **📈 Live Metrics & Performance**: Near real-time CPU (detailed per-vCPU breakdown), memory, storage read/write throughput, storage IOPS, and network I/O.
* **🖥️ Native & Embedded Terminals**: One-click SSH launch in your native terminal (Windows Terminal, iTerm2, macOS Terminal, Alacritty) or inline using embedded `xterm.js`.
* **🚨 Out-of-Band Rescue Console**: Detachable emergency VNC / Serial web console window.
* **🌐 VPCs, Firewalls & Load Balancers**: Private network topology, visual Inbound/Outbound firewall rules editor, load balancer forwarding rules, and health checks.
* **🌍 DNS Zone Manager**: Full DNS records CRUD (A, AAAA, CNAME, MX, TXT, SRV, NS, CAA) with real-time propagation checker.
* **🔐 Hardware-Encrypted Vault**: API tokens and OAuth secrets stored securely using Electron `safeStorage` (Windows DPAPI, macOS Keychain, Linux Secret Service).
* **🎛️ Multi-Account Profiles**: Switch instantly between personal, production, and client accounts.
* **⌨️ Global Command Palette (`Cmd+K` / `Ctrl+K`)**: Lightning-fast fuzzy search and keyboard shortcuts across your entire cloud fleet.
* **🔔 Desktop System Tray & Notifications**: Menu Bar / System Tray icon with fleet health badges (🟢/🟡/🔴) and OS alerts for high CPU or completed backups.

---

## 🛠️ Architecture & Tech Stack

* **Desktop Runtime**: Electron + TypeScript
* **Build System**: `electron-vite` + `electron-builder`
* **Frontend**: React 19 + Tailwind CSS + `shadcn/ui` + Lucide Icons
* **Data Fetching & Cache**: TanStack Query v5 (React Query)
* **API Client**: `openapi-typescript` + `openapi-fetch` (strongly-typed from BinaryLane OpenAPI 3.0.4)
* **Terminal**: `xterm.js` + `xterm-addon-fit`

---

## 🚀 Quick Start

### Prerequisites
* [Node.js](https://nodejs.org) (v20+ recommended)
* [npm](https://npmjs.com) or [pnpm](https://pnpm.io)

### Installation
```bash
# Clone the repository
git clone https://github.com/termau/bldesk.git
cd bldesk

# Install dependencies
npm install

# Run development mode (with HMR)
npm run dev

# Build production installer for your current OS
npm run build
```

---

## 📄 License
MIT © [termau](https://github.com/termau)
