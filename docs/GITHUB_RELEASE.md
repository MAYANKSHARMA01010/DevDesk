# DevDesk v1.0.0 — Native Developer Command Center (macOS Apple Silicon) 🖥️⚡

We are excited to announce the initial production release of **DevDesk (v1.0.0)**, an open-source, local-first developer command center designed to eliminate context-switching and bring project execution, process monitoring, Git workflows, API testing, environment editing, and database exploration into a single native desktop experience.

---

## 🌟 What is DevDesk?

Instead of keeping dozens of separate terminal tabs, Postman, database clients, Git GUIs, and process monitors running, DevDesk unifies your daily development workflows into a high-performance desktop interface. DevDesk operates 100% locally on your machine—no cloud synchronization, no third-party telemetry, and no remote code transmission.

---

## 🚀 Key Modules & Highlights

### 📁 Workspace & Project Discovery
- **Native macOS Directory Selection**: Point DevDesk to your workspace folders.
- **Deep Project Scanning**: Automatically detects Node.js, Next.js, Express, Vite, and other project types with package manager identification (`pnpm`, `npm`, `yarn`).
- **One-Click Actions**: Open projects directly in **Visual Studio Code** (`code <path>`) or **Reveal in Finder** (`showItemInFolder`).
- **Persistent Metadata**: Remembers workspaces across reboots using local SQLite.

### ⚡ Project Runner & Live Terminal
- **Script Discovery**: Reads and lists executable scripts directly from project `package.json` files.
- **Managed Execution**: Starts, stops, and restarts development servers and background tasks.
- **Streaming Output**: Bounded, real-time stdout and stderr log inspection with colorized terminal formatting.

### 🔍 Process & TCP Port Manager
- **Dynamic Port Detection**: Automatically detects actual TCP listening ports bound by DevDesk-managed processes using non-blocking OS inspection (`lsof`).
- **Process Isolation**: Strictly displays and controls processes launched by DevDesk, protecting unrelated system services from disruption.
- **Lifecycle Safety**: Cleanly terminates background processes and releases allocated ports when DevDesk closes.

### 🌿 Git Integration
- **Status Dashboard**: Inspect current branch, remote tracking, ahead/behind counters, and uncommitted change summaries.
- **Interactive Staging**: Stage and unstage individual files or entire trees with support for unborn branches (empty repositories).
- **Commit Workflow**: Commit directly from DevDesk with safety validation preventing empty messages or staging anomalies.
- **Unified Diff Viewer**: Side-by-side / unified diff inspection with line additions and deletions.

### 🧪 HTTP API Tester
- **Full Method Support**: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS`.
- **Query & Header Editor**: Key-value table builders with instant URL sync and custom header injection.
- **JSON Body Editor**: Real-time syntax validation, formatting error notifications, and payload size safeguards.
- **Response Inspector**: Formatted JSON viewer, raw text viewer, header tables, response timing (ms), and size metrics.
- **Cancellation & Timeouts**: Cancel in-flight HTTP requests instantly with configurable timeout bounds (default 30s) and a 2 MB response truncation guard.

### 🔐 Environment Variables Manager
- **Multi-File Detection**: Automatically lists `.env`, `.env.local`, `.env.development`, `.env.test`, `.env.production`, and `.env.example`.
- **Secret Masking**: Sensitive variables (tokens, passwords, secret keys) are masked by default with single-click visibility toggles.
- **Format Preservation**: Preserves original comments, section spacing, double quotes, and inline annotations.
- **Safety Backups & Atomic Writes**: Automatically creates timestamped `.bak` files before saving and uses atomic file replacement to eliminate data loss or partial writes.
- **Symlink & Path Traversal Guards**: Strict allowlist preventing symlink escapes or directory traversal outside the project root.

### 🗄️ PostgreSQL & MySQL Database Manager
- **Multi-Engine Support**: Native connection support for both PostgreSQL and MySQL.
- **Schema & Table Browser**: Browse schemas, tables, and views with column metadata (primary keys, nullable fields, data types).
- **Read-Only SQL Execution Guard**: Proprietary AST parser and regex validator that blocks destructive statements (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE`, file outputs, and multi-statement injection).
- **Table Data Previews**: Rapid pagination previews with configurable row limits (default 50).
- **Zero Password Persistence**: Database credentials are strictly stored in volatile memory for active sessions—passwords are **never** written to SQLite or disk.

### 🛠️ Diagnostics & Keyboard Shortcuts
- **Live Diagnostics**: Health checks, memory usage, uptime, Node version, Electron version, active processes, and data paths.
- **Universal Shortcuts**: Navigate between views instantly (`Cmd+1` through `Cmd+8`), rescan workspaces (`Cmd+R`), open folders (`Cmd+O`), or trigger diagnostics (`Cmd+D`).

---

## 📦 Distribution Packages

| File | Target Arch | Size | SHA-256 Checksum |
| :--- | :---: | :---: | :--- |
| **`DevDesk-1.0.0-arm64.dmg`** | Apple Silicon (`arm64`) | `138 MB` | `ce5d228fae8001464e95e62f26f57e6befab82d6d7d6ae1f2101c1692c6172ba` |
| **`DevDesk-1.0.0-arm64-mac.zip`** | Apple Silicon (`arm64`) | `140 MB` | `41db6ef09ebec9b093fae71386b81064872f63bd3edcda76dda0f150260d4b29` |

---

## 💻 Installation Instructions (macOS Apple Silicon)

1. **Download** `DevDesk-1.0.0-arm64.dmg`.
2. **Open the DMG** and drag **DevDesk** into your **Applications** folder.
3. **First-Launch Gatekeeper Notice**:
   Because this initial release is signed ad-hoc without a commercial Apple Developer ID, macOS Gatekeeper may present a notice on first launch (*"developer cannot be verified"*).
   
   To approve the application:
   - **Method A (Recommended)**: Right-click `DevDesk.app` in Finder, select **Open**, and click **Open** in the confirmation prompt.
   - **Method B (Terminal)**: Run:
     ```bash
     xattr -cr /Applications/DevDesk.app
     ```
4. **Launch DevDesk** from Launchpad or Applications.

---

## 🔒 Security & Privacy Policy

- **100% Local**: No external telemetry, tracking, or cloud sync.
- **Zero Database Password Storage**: Database connection passwords are kept in memory only for the duration of the active connection and are never saved to SQLite or disk.
- **Loopback Enforcement**: The internal Express backend binds strictly to `127.0.0.1`.
- **Electron Hardening**: Configured with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and strict typed IPC bridges.

---

## ⚠️ Known Limitations

- **Platform Support**: v1.0.0 targets macOS Apple Silicon (`arm64`). macOS Intel (`x64`), Windows, and Linux packages are planned for upcoming releases.
- **Live MySQL Validation**: The MySQL driver, SSL, and read-only AST safety validation are verified through unit/integration tests; however, live connection against a running MySQL daemon was unverified during build testing due to the absence of a local MySQL server on port 3306.
- **Notarization**: Builds are signed ad-hoc (`identity: null`) and are not yet notarized via Apple's paid developer program.
