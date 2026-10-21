# DevDesk — Release Verification & Acceptance Checklist 📋🚀

> **Target Release**: DevDesk v1.0.0  
> **Target Architecture**: macOS Apple Silicon (`arm64`)  
> **Build Mode**: Local Production Package (Self-Contained DMG & ZIP)

This document outlines the mandatory quality gates, security audits, and functional smoke tests required prior to releasing or distributing any build of DevDesk.

---

## 1. Metadata & Version Alignment

Verify that all package manifests and release documents reflect the exact target version (`1.0.0`):

- [x] **Root `package.json`**: `"version": "1.0.0"`
- [x] **Desktop `desktop/package.json`**: `"version": "1.0.0"`
- [x] **Backend `backend/package.json`**: `"version": "1.0.0"`
- [x] **Frontend `frontend/package.json`**: `"version": "1.0.0"`
- [x] **Packaging Spec `desktop/electron-builder.yml`**: App ID `com.devdesk.app`, product name `DevDesk`.
- [x] **Changelog `CHANGELOG.md`**: Includes `[1.0.0]` section documenting all 10 major completed modules.
- [x] **Documentation `README.md`**: References DevDesk v1.0.0 with matching setup and architecture details.

---

## 2. Artifact Integrity & SHA-256 Checksums

Confirm that both distribution archives exist in `release/` and match their computed cryptographic checksums:

| Artifact | Architecture | File Size | SHA-256 Checksum |
| :--- | :---: | :---: | :--- |
| **`DevDesk-1.0.0-arm64.dmg`** | `arm64` | `~138 MB` | `ce5d228fae8001464e95e62f26f57e6befab82d6d7d6ae1f2101c1692c6172ba` |
| **`DevDesk-1.0.0-arm64-mac.zip`** | `arm64` | `~140 MB` | `41db6ef09ebec9b093fae71386b81064872f63bd3edcda76dda0f150260d4b29` |
| **`DevDesk.app`** | `arm64` | App Bundle | Located in `release/mac-arm64/DevDesk.app` |

---

## 3. Clean-Install & First-Launch Checks

Perform a clean installation on an Apple Silicon Mac:

- [x] **DMG Mount**: Opening `DevDesk-1.0.0-arm64.dmg` mounts a volume containing `DevDesk.app` and an `/Applications` drag link.
- [x] **Drag-to-Applications**: Application copies cleanly into `/Applications/DevDesk.app`.
- [x] **Gatekeeper Quarantine**:
  - Running unsigned app produces expected macOS warning: *"developer cannot be verified"*.
  - Right-click -> Open or `xattr -cr /Applications/DevDesk.app` allows first launch cleanly.
- [x] **No Web Server Prerequisite**:
  - DevDesk launches **without** requiring a pre-started `next dev` or `localhost:3000` process.
  - UI assets load statically via the custom privileged `app://devdesk/` protocol.
- [x] **Application Icon**:
  - macOS Dock, Application Switcher (`Cmd+Tab`), and Finder display the multi-resolution DevDesk icon.

---

## 4. Backend Lifecycle & Port Safety

Verify automatic background orchestration:

- [x] **Auto-Start**: Electron spawns the packaged Express backend using the internal binary with `ELECTRON_RUN_AS_NODE: "1"`.
- [x] **Readiness Polling**: Frontend displays a graceful loading state while polling `http://127.0.0.1:5001/health` until 200 OK.
- [x] **Loopback Binding**: Express listener is bound strictly to `127.0.0.1` (never `0.0.0.0`).
- [x] **Port 5001 Conflict Detection**:
  - If another application occupies port 5001, DevDesk shows a clear diagnostic card with `lsof -i :5001` instructions.
  - DevDesk **does not** kill or disrupt the foreign application.
- [x] **Existing Backend Attachment**:
  - If a DevDesk backend is already running (e.g. during development), the shell detects it and attaches without spawning a duplicate.
- [x] **Graceful Teardown**:
  - Quitting the app (`Cmd+Q`, window close, or OS signal) sends `SIGTERM` to the backend child process.
  - Backend terminates managed child processes via `processManager.cleanupAll()` and closes database pools.
  - Zero orphaned processes or lingering port locks remain.

---

## 5. Persistence & Data Safety

Verify SQLite database operations:

- [x] **Storage Location**: Database file resides strictly in `~/Library/Application Support/DevDesk/devdesk.db`.
- [x] **Outside App Bundle**: Reinstalling or replacing `DevDesk.app` preserves existing workspace and profile data.
- [x] **No Persisted Secrets**:
  - Database passwords are **never** stored in SQLite (verified by schema inspection).
  - Environment file contents are never copied into DevDesk application storage.
- [x] **Restart Survivability**:
  - Scanned workspaces, detected projects, and connection profiles survive complete app restarts.

---

## 6. Functional Module Smoke Tests

Each core view must operate inside the packaged application:

- [x] **Projects & Workspaces**:
  - Native directory picker opens and returns valid directory path.
  - Projects are scanned and displayed with correct types and package managers.
  - Open in VS Code (`code <path>`) and Reveal in Finder work.
- [x] **Terminal & Script Runner**:
  - Discovers package.json scripts (`start`, `dev`, `build`, `test`).
  - Starts child process and streams stdout/stderr incrementally.
  - Stopping or restarting updates status badges in real time.
- [x] **Process & Port Manager**:
  - Identifies active DevDesk-managed processes and their bound TCP ports.
  - Foreign system processes are never listed or controllable.
- [x] **Git Integration**:
  - Displays current branch, ahead/behind tracking, and modified files.
  - Stages/unstages files cleanly.
  - Diff viewer renders line additions and deletions.
  - Commits changes with non-empty message validation.
- [x] **HTTP API Tester**:
  - Sends `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.
  - Parses JSON response bodies and displays status, duration, and size.
  - In-flight request cancellation and 30-second timeout enforcement work.
- [x] **Environment Variables Manager**:
  - Lists supported files (`.env`, `.env.local`, `.env.development`, etc.).
  - Sensitive keys (`API_KEY`, `SECRET`, `PASSWORD`) are masked by default.
  - Saves variables atomically and creates `.bak` backups while preserving comments.
  - Blocks path traversal (`../`) and symlink escapes outside the project root.
- [x] **Database Manager**:
  - Creates, edits, and deletes connection profiles for PostgreSQL and MySQL.
  - Browses schemas, tables, and views with primary key and data type metadata.
  - Read-only AST safety guard blocks all destructive statements (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE`, file outputs).
- [x] **Settings & Diagnostics**:
  - Renders live uptime, memory consumption, Node/Electron versions, and data directory path.
  - Keyboard shortcuts (`Cmd+1`–`Cmd+8`) navigate views instantly.

---

## 7. Security & Release Hygiene

- [x] **Zero Hardcoded Personal Paths**: No occurrences of `/Users/<username>` or local absolute paths in source code or documentation.
- [x] **Zero Tracked Credentials**: No `.env`, `.pem`, `.key`, or `.db` files tracked in Git (`git ls-files` audited).
- [x] **Electron Hardening**:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true`
  - `webSecurity: true`
  - Preload exposes only typed, minimally scoped IPC bridges.
- [x] **No Auto-Publishing**: No automatic GitHub release triggers, tag creation, or remote distribution without manual review.

---

## 8. Known Limitations & Disclosure

- **Architecture**: The installer targets Apple Silicon (`arm64`). macOS Intel (`x64`), Windows, and Linux are planned for future multi-platform pipelines.
- **MySQL Live Server**: Drivers and AST parsing are implemented and regression-tested, but live connection to a running MySQL server on port 3306 was unverified due to the absence of a local daemon.
- **Apple Notarization**: Ad-hoc code signing (`identity: null`) is configured for local development. Full Gatekeeper bypass requires an active Apple Developer Team ID and `notarytool` submission.

---

## 9. Final Sign-off

| Role | Status | Date | Notes |
| :--- | :---: | :---: | :--- |
| **Build & Packaging Engineer** | ✅ APPROVED | 2026-10-21 | Package reproducible via `pnpm run package:mac` |
| **Quality & Regression QA** | ✅ APPROVED | 2026-10-21 | All 6 regression test suites passed (100%) |
| **Security Reviewer** | ✅ APPROVED | 2026-10-21 | Zero secret storage, loopback restricted, AST enforced |
