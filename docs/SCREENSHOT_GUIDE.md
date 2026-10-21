# DevDesk — Screenshot Capture Guide & Checklist 📸✨

> **Purpose**: A standardized guide for capturing high-quality, privacy-compliant screenshots of DevDesk for documentation, marketing assets, and GitHub release pages.

---

## 1. Capture Standards & Environment

To maintain visual consistency across all documentation:

| Attribute | Specification |
| :--- | :--- |
| **Window Dimensions** | `1200 x 800` (DevDesk default window size) |
| **macOS Theme** | Dark Mode (`System Settings > Appearance > Dark`) |
| **Display Resolution** | Standard Retina (`@2x` scale factor preferred, e.g., 2400x1600 output) |
| **Format** | Optimized PNG (`.png`) |
| **Destination Folder** | `docs/screenshots/` |
| **Background / Framing** | Window shadow only (captured via `Cmd + Shift + 4` then `Spacebar` + Click window) |

---

## 2. Privacy & Data Sanitization Rules

Before capturing any screenshot, ensure that:

1. **Zero Personal Paths**: Paths shown in the UI should use dummy or generic workspace paths (such as `/Users/developer/Projects/my-app` or `/tmp/devdesk-demo-app`), never personal home directories.
2. **Zero Real Secrets**: Environment variables must only show simulated dummy values (`demo_key_xyz`, `http://localhost:5432`), never real production tokens, keys, or passwords.
3. **No Sensitive Repositories**: Git repositories displayed must be public open-source repositories or the disposable demo app created in `docs/DEMO_SCRIPT.md`.
4. **No Real Database Data**: Database tables must show dummy seed data, never real user or production data.

---

## 3. Recommended Screenshot Checklist

Capture the following 8 core screens to represent all major modules:

### 📸 Screen 1: Projects & Workspaces
- **File Name**: `docs/screenshots/01_projects_view.png`
- **View**: Projects tab (`Cmd+1`).
- **State**: At least 2–3 discovered project cards showing project name, project type badge (`Next.js`, `Express`, `React`), detected package manager (`pnpm`, `npm`), and action buttons (**Open in VS Code**, **Reveal in Finder**).

### 📸 Screen 2: Script Runner & Terminal Logs
- **File Name**: `docs/screenshots/02_terminal_runner.png`
- **View**: Terminal tab (`Cmd+2`).
- **State**: A project script running (e.g. `start` or `dev`), with green `running` badge, PID, and live colorized stdout/stderr output lines.

### 📸 Screen 3: Process & TCP Port Manager
- **File Name**: `docs/screenshots/03_process_ports.png`
- **View**: Processes tab (`Cmd+3`).
- **State**: Active DevDesk process listed with CPU/memory status and detected listening TCP ports (`:4005 🟢 Detected`).

### 📸 Screen 4: Git Status & Diff Viewer
- **File Name**: `docs/screenshots/04_git_diff.png`
- **View**: Git tab (`Cmd+4`).
- **State**: Repository showing current branch (`main`), staged/unstaged changes, and an expanded unified diff viewer showing green additions and red deletions.

### 📸 Screen 5: HTTP API Tester
- **File Name**: `docs/screenshots/05_api_tester.png`
- **View**: API Tester tab (`Cmd+5`).
- **State**: Completed `GET` or `POST` request showing `200 OK`, execution time in milliseconds, and formatted JSON response body with syntax highlighting.

### 📸 Screen 6: Environment Variables Editor
- **File Name**: `docs/screenshots/06_env_manager.png`
- **View**: Environment tab (`Cmd+6`).
- **State**: Loaded `.env` file showing key-value table, comments preserved, and at least one secret masked (`••••••••`) with the eye toggle button.

### 📸 Screen 7: Database Manager & Read-Only Query Explorer
- **File Name**: `docs/screenshots/07_database_manager.png`
- **View**: Database tab (`Cmd+7`).
- **State**: Connected database showing tables and views list on the left, table schema columns (primary key badge, data types) in the center, and a read-only `SELECT` query result table.

### 📸 Screen 8: System Diagnostics & Settings
- **File Name**: `docs/screenshots/08_diagnostics.png`
- **View**: Settings & Diagnostics tab (`Cmd+8`).
- **State**: System overview showing DevDesk v1.0.0, Node.js version, Electron version, platform (`darwin arm64`), uptime, memory graph, and data directory path.

---

## 4. Capturing Steps with macOS Native Tooling

```bash
# 1. Create the screenshots directory
mkdir -p docs/screenshots

# 2. To capture any window with native shadow:
#    Press: Cmd + Shift + 4
#    Press: Spacebar (pointer turns into camera)
#    Click: DevDesk window
#    Move file to docs/screenshots/<filename>.png
```
