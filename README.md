# DevDesk 🖥️⚡

> **The Native Desktop Command Center for Software Engineers.**  
> Effortlessly orchestrate workspaces, run project scripts with live logs, monitor processes and listening ports, manage Git repositories, test HTTP APIs, safely edit environment files, and query relational databases — all inside a single, high-performance desktop application.

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg?style=flat-square)](package.json)
[![Platform](https://img.shields.io/badge/platform-macOS%20Apple%20Silicon%20%28arm64%29-black.svg?style=flat-square&logo=apple)](https://drive.google.com/drive/folders/1raRV1BxgL3lI7Tz-kflxTMlECMHlPDvK?usp=sharing)
[![Electron](https://img.shields.io/badge/electron-44.4.4-47848F.svg?style=flat-square&logo=electron)](desktop/package.json)
[![Next.js](https://img.shields.io/badge/next.js-16.3.8-000000.svg?style=flat-square&logo=nextdotjs)](frontend/package.json)
[![React](https://img.shields.io/badge/react-19.2.8-61DAFB.svg?style=flat-square&logo=react)](frontend/package.json)
[![TypeScript](https://img.shields.io/badge/typescript-5.9.3-3178C6.svg?style=flat-square&logo=typescript)](tsconfig.json)
[![License](https://img.shields.io/badge/license-ISC-green.svg?style=flat-square)](LICENSE)
[![Privacy](https://img.shields.io/badge/privacy-100%25%20Local%20%7C%20Zero%20Cloud-success.svg?style=flat-square)](#security--privacy-policy)

---

## 🚀 Direct Download

DevDesk is available as a standalone, self-contained macOS installer with all dependencies embedded:

<table>
  <tr>
    <td align="center" style="padding: 20px;">
      <h3>📦 macOS Apple Silicon (M1/M2/M3/M4)</h3>
      <p>Self-contained installer with embedded Node.js backend & SQLite engine (140 MB)</p>
      <a href="https://drive.google.com/drive/folders/1raRV1BxgL3lI7Tz-kflxTMlECMHlPDvK?usp=sharing">
        <img src="https://img.shields.io/badge/⬇️_Download_DevDesk_DMG-Google_Drive-4285F4?style=for-the-badge&logo=googledrive&logoColor=white" alt="Download DevDesk DMG" />
      </a>
      <br /><br />
      <sub>Direct Drive Link: <a href="https://drive.google.com/drive/folders/1raRV1BxgL3lI7Tz-kflxTMlECMHlPDvK?usp=sharing">https://drive.google.com/drive/folders/1raRV1BxgL3lI7Tz-kflxTMlECMHlPDvK?usp=sharing</a></sub>
    </td>
  </tr>
</table>

> [!TIP]
> **First-Launch macOS Notice**: Because this build is signed ad-hoc for developer evaluation without a paid Apple Developer certificate, right-click `DevDesk.app` in Finder and select **Open** (or run `xattr -cr /Applications/DevDesk.app` in terminal). See [Gatekeeper Instructions](#macos-gatekeeper-first-launch-guide).

---

## Table of Contents

- [Overview & Philosophy](#overview--philosophy)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Design System (Midnight Slate)](#design-system-midnight-slate)
- [Documentation Index](#documentation-index)
- [Local Development Setup](#local-development-setup)
- [Building the Production Package](#building-the-production-package)
- [macOS Gatekeeper First-Launch Guide](#macos-gatekeeper-first-launch-guide)
- [Security & Privacy Policy](#security--privacy-policy)
- [License](#license)

---

## Overview & Philosophy

Modern software development requires juggling half a dozen disparate tools simultaneously: terminal tabs, Postman, database GUIs, Git clients, process monitors, and text editors.

**DevDesk** unifies these critical workflows into a single high-performance desktop dashboard:

- **100% Local & Offline**: Operates entirely on your machine. Zero telemetry, zero analytics, zero external network calls.
- **True Desktop Integration**: Built with Electron, offering native directory selection dialogs, VS Code project launching, and system Finder integration.
- **Independent Monorepo & Multi-Project Isolation**: Deeply scans workspaces up to 4 levels deep, distinguishing root repositories from nested microservices.
- **AST-Guarded Database Studio**: Browse PostgreSQL and MySQL tables with strict AST validation that blocks destructive SQL commands (`INSERT`, `UPDATE`, `DELETE`, `DROP`). Passwords are kept solely in volatile memory during active sessions and are never saved to disk.

---

## Key Features

### 📁 1. Workspace & Project Discovery
- **Deep Recursive Scanner**: Scans workspace folders up to 4 directory levels deep, accurately tagging root projects (`isRoot: true`) and nested packages.
- **Tech Stack & Tooling Badges**: Automatically detects Next.js, React, Express, Vite, Python, Go, Rust, and package managers (`pnpm`, `npm`, `yarn`, `bun`).
- **Single-Line Horizontal Script Bar**: Projects automatically inspect `package.json` scripts (`dev`, `build`, `test`, `start`, `lint`) and render them in a clean, scrollable horizontal row with smart action badges.
- **One-Click Native Actions**: Open projects directly in **Visual Studio Code** (`code <path>`) or **Reveal in Finder** (`showItemInFolder`).
- **SQLite Persistence**: Automatically preserves workspaces across restarts in local SQLite storage.

### ⚡ 2. Project Script Runner & Live Terminal
- **Managed Child Processes**: Spawns development scripts with detached process group isolation for clean teardown.
- **Bounded Stream Buffering**: Real-time stdout and stderr log inspection with colorized terminal output and status badges (`running`, `stopped`, `failed`).
- **Lifecycle Safety**: Cleanly terminates background processes and releases allocated ports when DevDesk closes.

### 🔍 3. Process & TCP Port Manager
- **Live Port Detection**: Detects actual TCP listening ports bound by DevDesk-managed processes in real time using non-blocking OS inspection (`lsof`).
- **Horizontal Services Bar**: Interactive service cards with horizontal scroll controls and quick status indicators.
- **Default Browser Opener**: One-click opening of local servers (`http://localhost:3000`) in your default macOS browser via Electron IPC.
- **In-App Interactive Web Preview**: Built-in modal preview with editable address bar, viewport switcher (**Desktop**, **Tablet**, **Mobile**), and instant reload.

### 🌿 4. Multi-Repository Git Control Suite
- **Isolated Repository Targeting**: Resolves each project's exact Git root independently, preventing subdirectories from polluting parent repositories.
- **Credential Redaction**: Automatically redacts embedded tokens and passwords from remote URLs in UI and persistent storage (`https://***:***@github.com/...`).
- **Stage All & Commit**: One-click staging and commit workflow, eliminating roadblocks when 0 files are staged.
- **Commit & Push 🚀**: Integrated push and pull triggers allowing you to sync changes with remote branches without leaving DevDesk.
- **Side-by-Side / Unified Diff Viewer**: Clear inspection of additions, deletions, and file status badges.

### 🧪 5. HTTP API Tester
- **Full Method Support**: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.
- **Query & Header Editor**: Key-value table builders with instant URL sync and custom header injection.
- **JSON Body Editor**: Real-time syntax validation, formatting error notifications, and payload size safeguards.
- **Response Inspector**: Formatted JSON viewer, raw text viewer, header tables, response timing (ms), and size metrics.
- **Cancellation & Timeouts**: Cancel in-flight HTTP requests instantly with configurable timeout bounds (default 30s) and a 2 MB response truncation guard.

### 🔐 6. Environment Variables Manager
- **Multi-File Detection**: Automatically lists `.env`, `.env.local`, `.env.development`, `.env.test`, `.env.production`, and `.env.example`.
- **Secret Masking**: Sensitive variables (tokens, passwords, secret keys) are masked by default with single-click visibility toggles.
- **Format Preservation**: Preserves original comments, section spacing, double quotes, and inline annotations.
- **Safety Backups & Atomic Writes**: Automatically creates timestamped `.bak` files before saving and uses atomic file replacement to eliminate data loss or partial writes.
- **Symlink & Path Traversal Guards**: Strict allowlist preventing symlink escapes or directory traversal outside the project root.

### 🗄️ 7. PostgreSQL & MySQL Database Studio
- **Multi-Engine Support**: Native connection support for both PostgreSQL and MySQL.
- **Schema & Table Browser**: Browse schemas, tables, and views with column metadata (primary keys, nullable fields, data types).
- **Read-Only SQL Execution Guard**: Proprietary AST parser and validator that blocks destructive statements (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE`, file outputs, and multi-statement injection).
- **Table Data Previews**: Rapid pagination previews with configurable row limits (default 50).
- **Zero Password Persistence**: Database credentials are strictly stored in volatile memory for active sessions—passwords are **never** written to SQLite or disk.

### 🛠️ 8. System Diagnostics & Keyboard Shortcuts
- **Live Diagnostics**: Health checks, memory usage, uptime, Node version, Electron version, active processes, and data paths.
- **Universal Shortcuts**: Navigate between views instantly (`Cmd+1` through `Cmd+8`), rescan workspaces (`Cmd+R`), open folders (`Cmd+O`), or trigger diagnostics (`Cmd+D`).

---

## System Architecture

```mermaid
flowchart TB
    subgraph DesktopApp ["DevDesk Desktop Application (macOS)"]
        subgraph ElectronMain ["Electron Main Process (Node.js & Chromium)"]
            Shell["Desktop Shell (main.ts)"]
            Protocol["Privileged app:// Protocol Handler"]
            IPC["Secure Context-Isolated IPC Bridge"]
            Lifecycle["Managed Backend Process Runner"]
        end

        subgraph PackagedFrontend ["Packaged Frontend (Resources/frontend)"]
            StaticExport["Next.js Static Export (HTML / CSS / JS)"]
            UI["React 19 Views (Projects, Git, Terminal, DB, Env, API)"]
            Theme["Midnight Slate Design System"]
        end

        subgraph PackagedBackend ["Packaged Backend (Resources/backend)"]
            Express["Express REST API (127.0.0.1:5001 / Dynamic Port)"]
            Services["Core Services Engine"]
            SQLiteDriver["better-sqlite3 / node:sqlite Driver"]
        end
    end

    subgraph OS ["Host Operating System & Storage"]
        AppData[("~/Library/Application Support/DevDesk/devdesk.db")]
        ProjectsDir["Local Developer Workspaces & Git Repositories"]
        ExternalDB[("Local PostgreSQL & MySQL Instances")]
    end

    Shell -->|"Serves app://devdesk/"| StaticExport
    StaticExport --> UI
    UI -->|"Typed IPC (Dialogs, External URLs, Finder)"| IPC
    UI -->|"HTTP Fetch API (127.0.0.1:5001)"| Express
    Lifecycle -->|"Spawns backend process"| Express
    Express --> Services
    Services --> SQLiteDriver
    SQLiteDriver -->|"Reads/Writes Metadata"| AppData
    Services -->|"Spawns scripts & lsof port inspection"| ProjectsDir
    Services -->|"Read-only queries via AST parser"| ExternalDB
```

---

## Design System (Midnight Slate)

DevDesk features the **Midnight Slate** engineering design system, designed specifically to avoid generic dark-mode aesthetics:

| Element | Color Token | Hex Code | Description |
| :--- | :--- | :--- | :--- |
| **App Canvas** | Slate Dark | `#0B0F17` / `#101216` | Deep neutral background, comfortable for all-day use. |
| **Header & Sidebar** | Surface Neutral | `#111827` / `#171A20` | Clean structural frame with high-contrast active tabs. |
| **Cards & Panels** | Slate Surface | `#161F30` / `#1D2129` | High-contrast elevated panels with subtle border lines. |
| **Borders & Dividers** | Muted Stroke | `#1F293D` / `#303642` | Crisp 1px borders delineating workspaces and modules. |
| **Primary Accent** | Electric Blue | `#3B82F6` / `#8CA9CF` | Focused primary actions, active indicators, and selection. |
| **Running / Success** | Emerald | `#10B981` | Active scripts, listening ports, clean git status. |
| **Warning / Notice** | Amber | `#F59E0B` | Stale branches, uncommitted changes, modified env vars. |
| **Danger / Stopped** | Rose | `#F43F5E` | Stopped processes, port conflicts, AST query blocks. |

---

## Documentation Index

Comprehensive senior-engineer documentation is available in the [`docs/`](docs/) directory:

- 🎓📄 [**Faculty Project Technical Briefing (`docs/FACULTY_PROJECT_REPORT.md`)**](docs/FACULTY_PROJECT_REPORT.md) *(Print-ready [PDF format](docs/DevDesk_Faculty_Project_Report.pdf))*: Academic executive summary, point-by-point feature breakdown, engineering motivations, and evaluation metrics.
- 🏛️ [**System Architecture (`docs/ARCHITECTURE.md`)**](docs/ARCHITECTURE.md): Multi-tier architecture, IPC communication protocol, process isolation, and security design.
- 💻 [**Developer Setup & Engineering Guide (`docs/DEVELOPMENT_GUIDE.md`)**](docs/DEVELOPMENT_GUIDE.md): Monorepo setup, running individual tiers, TypeScript guidelines, and adding new features.
- 📦 [**Packaging & Release Engineering (`docs/PACKAGING_AND_RELEASES.md`)**](docs/PACKAGING_AND_RELEASES.md): How `prepare-packaging.mjs` bundles 129 production dependencies, DMG build specs, and Gatekeeper verification.
- 🤖📜 [**Complete AI Development History (`docs/AI_DEVELOPMENT_HISTORY.md`)**](docs/AI_DEVELOPMENT_HISTORY.md): Full chronological transcripts and architectural evolution covering both the ChatGPT session and Antigravity IDE pair-programming.

---

## Local Development Setup

### Prerequisites
- macOS 13.0+ (Apple Silicon or Intel)
- Node.js `v20.17+` (`v22+` recommended)
- `pnpm` `v11.0+` (`npm install -g pnpm@11.24.0`)

### Installation & Launch

```bash
# 1. Clone repository
git clone https://github.com/MAYANKSHARMA01010/DevDesk.git
cd DevDesk

# 2. Install monorepo dependencies
pnpm install

# 3. Verify TypeScript build
pnpm run build

# 4. Start all tiers concurrently (Frontend, Backend, and Electron Shell)
pnpm run dev
```

---

## Building the Production Package

To produce the standalone macOS Disk Image (`.dmg`):

```bash
pnpm run package:mac
```

This automated orchestrator:
1. Builds Next.js into a static export (`frontend/out/`).
2. Compiles backend TypeScript (`backend/dist/`).
3. Deploys an isolated production backend bundle with all 129 dependencies into `.packaging/backend/`.
4. Compiles Electron main and preload scripts (`desktop/dist/`).
5. Generates the final macOS Disk Image in `release/DevDesk-1.0.0-arm64.dmg` (~140 MB).

---

## macOS Gatekeeper First-Launch Guide

Because locally packaged developer builds are signed ad-hoc without a commercial Apple Developer ID, macOS Gatekeeper may present a prompt on first launch (*"developer cannot be verified"*).

### Option A: Finder Right-Click (Recommended)
1. Open your **Applications** folder in Finder.
2. **Right-click** (or `Control`-click) on **DevDesk.app**.
3. Select **Open** from the context menu.
4. Click **Open** in the confirmation dialog. macOS will permanently remember this approval.

### Option B: Terminal Command
```bash
xattr -cr /Applications/DevDesk.app
```

---

## Security & Privacy Policy

- **Zero Cloud & Zero Telemetry**: DevDesk contains no tracking scripts, analytics, or external phone-home APIs.
- **Strict Loopback Binding**: The Express microservice is strictly bound to `127.0.0.1`.
- **Zero Database Password Persistence**: Database credentials are stored strictly in volatile process memory for active sessions—passwords are **never written to SQLite or disk**.
- **AST Query Validation**: All SQL queries executed through the Database Studio are parsed into an Abstract Syntax Tree to prevent accidental or malicious data modification.

---

## License

This project is open-source software licensed under the [ISC License](LICENSE).