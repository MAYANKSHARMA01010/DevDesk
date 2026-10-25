# DevDesk — System Architecture & Technical Specifications 🏛️⚡

> **Version**: 1.0.0  
> **Target Platform**: macOS (Apple Silicon `arm64` & Intel `x64`)  
> **Design Philosophy**: Local-First, Zero-Cloud, Zero-Telemetry, Native OS Integration.

---

## 1. High-Level Architectural Vision

Modern software engineering involves continuous context switching between fragmented developer tools: code editors, terminal tabs, Postman, Git GUI clients, database inspection tools, process monitors, and environment files.

**DevDesk** consolidates these workflows into a single high-performance desktop application. Built on an isolated multi-process architecture (Electron + Next.js + Node.js/Express + SQLite), DevDesk guarantees complete data privacy: all code, credentials, queries, and logs remain strictly on your local machine with zero telemetry or cloud transmission.

---

## 2. Multi-Tier System Diagram

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

## 3. Core Subsystems

### 3.1 Electron Desktop Shell (`desktop/`)
- **Process Model**: Operates with Electron's security best practices (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
- **Privileged Protocol**: Registers `app://devdesk/` to serve statically exported frontend assets directly from memory, eliminating the need for an internal HTTP web server for the UI.
- **Typed IPC Bridge (`preload.ts`)**: Exposes tightly scoped, immutable methods via `window.electronAPI`:
  - `selectDirectory()`: Invokes native macOS `dialog.showOpenDialog` for workspace folder picking.
  - `openExternalUrl(url)`: Validates and delegates external links to the user's default macOS browser.
  - `openInVSCode(path)`: Launches Visual Studio Code directly targeting the specified project path.
  - `revealInFinder(path)`: Calls `shell.showItemInFolder()` to reveal files in macOS Finder.
- **Backend Process Orchestration**: Spawns the internal Node.js Express backend upon startup, captures stdout/stderr, monitors health status on `127.0.0.1:5001` (with dynamic fallback ports), and cleanly terminates child processes on application exit.

### 3.2 Frontend Architecture (`frontend/`)
- **Framework**: Next.js 16 (App Router) compiled with `output: "export"` for 100% static client-side rendering.
- **UI Engine**: React 19 with custom TailwindCSS 4 styling adhering to the **Midnight Slate** engineering design system.
- **Key Modules**:
  1. **Workspaces & Projects**: Workspace directory scanning, technology detection badges, single-line horizontal scroll for detected scripts, one-click VS Code and Finder triggers.
  2. **Live Script Runner & Terminal**: Colorized process execution, real-time log streaming, bounded ring buffers, process stop/restart controls.
  3. **Process & Port Manager**: Interactive listening service cards, horizontal scroll controls, direct default browser opener, and in-app interactive web preview modal with responsive viewports (Desktop / Tablet / Mobile).
  4. **Git Control Suite**: Independent repository targeting, branch status, ahead/behind counters, interactive staging, "Stage All & Commit", "Commit & Push 🚀", unified side-by-side diff viewer, and branch switching.
  5. **HTTP API Tester**: Multi-method REST client (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, etc.), query and header key-value editors, JSON body validation, timing metrics, and response size caps.
  6. **Environment Variables Editor**: Multi-file switcher (`.env`, `.env.local`, `.env.production`), secret masking with eye toggles, comment preservation, and atomic backup writing.
  7. **Database Studio**: PostgreSQL and MySQL relational explorer, table schema metadata browser, read-only SQL query runner with AST enforcement, and zero-disk credential persistence.
  8. **System Diagnostics**: Memory utilization graphs, uptime, system versions, active processes, and SQLite database file inspection.

### 3.3 Express Local Microservice (`backend/`)
- **Binding**: Strictly bound to loopback `127.0.0.1` (never exposed to external interfaces or `0.0.0.0`).
- **Project Discovery Engine**:
  - Scans workspace directories recursively up to 4 levels deep.
  - Accurately differentiates root projects (`isRoot: true`) from nested components (`isRoot: false`).
  - Detects package managers (`pnpm`, `npm`, `yarn`, `bun`, `cargo`, `poetry`) and tech stacks (Next.js, React, Express, Vite, Python, Rust, Go).
- **Process Manager**:
  - Spawns child processes using detached process groups for clean teardown.
  - Streams stdout and stderr into bounded circular memory buffers (1,000 lines max per process).
  - Uses non-blocking OS inspection (`lsof -iTCP -sTCP:LISTEN -n -P`) to detect active ports bound exclusively by DevDesk child processes.
- **Multi-Repository Git Engine**:
  - Resolves repository boundaries using `git rev-parse --show-toplevel`.
  - Ensures nested subdirectories never accidentally mutate parent repository state.
  - Automatically sanitizes and redacts authentication credentials embedded in remote URLs (`https://***:***@github.com/...`).
- **SQL Security Engine**:
  - Utilizes `node-sql-parser` to construct an Abstract Syntax Tree (AST) for all executed queries.
  - Strictly allows only read operations (`SELECT`, `SHOW`, `DESCRIBE`, `EXPLAIN`).
  - Blocks all destructive statements (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE`, and multi-statement queries).
- **Environment Safety Engine**:
  - Validates that targeted `.env` paths reside strictly within the project directory to prevent symlink traversal attacks.
  - Performs atomic file replacement using temporary files and creates timestamped `.bak` files prior to any write.

### 3.4 Persistent Storage Layer (SQLite)
- **Database Location**: Stored in standard macOS application support directory:
  ```text
  ~/Library/Application Support/DevDesk/devdesk.db
  ```
- **Driver**: High-performance synchronous `better-sqlite3` with an automatic graceful fallback to Node's built-in `node:sqlite`.
- **Engine Configuration**: Configured with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) and synchronous normal mode for high concurrency and crash resilience.
- **Schema Management**:
  - `workspaces`: Registered workspace directory paths, last-scanned timestamps, and labels.
  - `projects`: Discovered project metadata, framework badges, and package managers.
  - `database_connections`: Saved connection profiles (host, port, username, database name, engine type). **Note: Database passwords are NEVER saved to SQLite**.

---

## 4. Security & Isolation Model

| Security Vector | Implementation Detail |
| :--- | :--- |
| **Network Exposure** | Backend listener binds strictly to `127.0.0.1`. No remote or public interface listening. |
| **Renderer Sandbox** | Chromium sandbox enabled, Node.js integration disabled in renderer, context isolation active. |
| **Database Credentials** | Kept in volatile process memory only during active sessions; never persisted to disk or SQLite. |
| **Path Traversal Guards** | All file operations strictly validate canonical paths against project boundaries (`path.resolve`). |
| **SQL Safety** | AST parsing blocks all data modification and schema alteration queries. |
| **External Links** | Rendered links cannot navigate the main frame; delegated via Electron IPC to system browser. |

---

## 5. Technology Stack Summary

- **Desktop Shell**: Electron 44.4.4
- **Frontend**: Next.js 16.3.8, React 19.2.8, TailwindCSS 4.3.3
- **Backend Service**: Express 5.2.1, Node.js 20+
- **Local Persistence**: SQLite 3 (`better-sqlite3` / `node:sqlite`)
- **Database Drivers**: `pg` 8.23.1, `mysql2` 3.24.6
- **SQL Parser**: `node-sql-parser` 5.4.0
- **Build & Packaging**: `electron-builder` 26.15.3, `pnpm` 11 workspaces
