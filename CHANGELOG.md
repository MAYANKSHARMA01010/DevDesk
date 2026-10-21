# Changelog

All notable changes to DevDesk will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-10-21

### Initial Production Release — Developer Command Center

This milestone marks the first production release of **DevDesk**, providing a comprehensive, local-first developer command center for macOS Apple Silicon.

#### 🚀 Highlights & Features

- **Electron Desktop Shell & IPC**:
  - Secure, context-isolated native application window with minimum dimensions (960x640) and dark-mode styling.
  - Typed IPC bridge exposing native folder selection dialogs (`dialog:select-directory`), **Open in VS Code**, and **Reveal in Finder**.
  - Custom privileged `app://` protocol serving static Next.js production exports securely without a local HTTP web server.

- **Workspace & Project Discovery**:
  - Recursive directory scanner identifying Node.js, Next.js, Express, Vite, and other project types with package manager detection (`pnpm`, `npm`, `yarn`).
  - Persistent SQLite storage (`~/Library/Application Support/DevDesk/devdesk.db`) storing scanned workspaces and project metadata across application restarts.
  - Workspace switching, rescanning, and deletion.

- **Project Script Runner & Terminal**:
  - Discovers executable scripts from project `package.json` files.
  - Managed child process execution with start, stop, and restart controls.
  - Real-time incremental stdout/stderr log streaming with circular buffer safeguards.

- **Process & TCP Port Monitoring**:
  - Live inspection of TCP listening ports bound by DevDesk-managed processes using non-blocking OS inspection (`lsof`).
  - Zero foreign process interference: strictly displays and controls processes started by DevDesk.
  - Automatic graceful cleanup of child processes upon desktop shutdown.

- **Git Integration**:
  - Repository branch detection, commit tracking, ahead/behind counters, and uncommitted change badges.
  - Interactive file staging and unstaging with support for empty/unborn branches.
  - Commit creation with validation preventing empty commit messages or unstaged commits.
  - Unified file diff viewer with line additions and deletions.
  - Branch switching with conflict prevention.

- **HTTP API Tester**:
  - Lightweight Postman-style REST API tester supporting `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS`.
  - Header and query parameter builders with URL synchronization.
  - Formatted JSON response inspector, raw body viewer, and status/timing/size metrics.
  - Instant request cancellation and 30-second timeout enforcement with a 2 MB response truncation guard.

- **Environment Variables Manager**:
  - Multi-file inspection (`.env`, `.env.local`, `.env.development`, `.env.test`, `.env.production`, `.env.example`).
  - Comment and layout preservation across round-trip edits.
  - Automatic timestamped safety backups (`.bak`) and atomic file replacement.
  - Secret masking for sensitive keys (`API_KEY`, `SECRET`, `PASSWORD`, `TOKEN`).
  - Strict directory traversal and symlink escape validation.

- **Database Manager**:
  - Multi-database connection manager supporting PostgreSQL and MySQL.
  - Schema, table, and view explorer with column metadata (primary keys, nullability, data types).
  - Rapid table preview sampling with row pagination.
  - Strict AST-based read-only SQL enforcement blocking `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE`, file outputs, and multiple-statement injection.
  - Zero password persistence: credentials are kept strictly in volatile memory for active sessions and are never stored in SQLite or on disk.

- **System Diagnostics & Accessibility**:
  - Real-time system diagnostics dashboard monitoring memory, uptime, Node version, Electron version, and storage paths.
  - Universal keyboard shortcuts (`Cmd+1`–`Cmd+8`, `Cmd+R`, `Cmd+O`, `Cmd+D`).

- **macOS Production Packaging**:
  - Automated repeatable build script (`pnpm run package:mac`).
  - Self-contained Apple Silicon DMG installer (`DevDesk-1.0.0-arm64.dmg`) and ZIP archive (`DevDesk-1.0.0-arm64-mac.zip`).
  - Bundled multi-resolution application icon (`icon.icns`).
  - Automatic backend startup using the bundled Electron executable with `ELECTRON_RUN_AS_NODE: "1"`.
  - Port conflict detection with graceful error reporting and clean shutdown handlers.
