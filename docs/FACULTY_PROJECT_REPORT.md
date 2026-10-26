# DevDesk — Project Report for Faculty Evaluation 🖥️

**Project Name**: DevDesk (Developer Command Center)  
**Student Name**: Mayank Sharma  
**Platform**: macOS Desktop App (Apple Silicon & Intel)  
**GitHub Repository**: [https://github.com/MAYANKSHARMA01010/DevDesk](https://github.com/MAYANKSHARMA01010/DevDesk)  
**Mac DMG Download Link**: [Google Drive DMG Link](https://drive.google.com/drive/folders/1raRV1BxgL3lI7Tz-kflxTMlECMHlPDvK?usp=sharing)  

---

## 1. What is DevDesk? (Simple Overview)

DevDesk is a desktop application built for software developers so they don't have to keep 5 to 6 heavy applications open at the same time.

Normally, when working on a project, a developer has to open:
- **VS Code** (for writing code)
- **Terminal / iTerm** (for running `npm run dev`, `build`, etc.)
- **Postman** (for testing APIs)
- **Git GUI / GitHub Desktop** (for checking branches, commits, and diffs)
- **DBeaver or pgAdmin** (for inspecting database tables)
- **Activity Monitor / Terminal** (for finding and killing ports like `3000` or `5000` that get stuck)

**DevDesk brings all these daily tools together into one single desktop window.** It runs completely on the user's laptop (100% offline, local-first) with zero cloud dependency and zero tracking.

---

## 2. Why I Built This? (Problem Statement)

1. **Laptop Lag & High RAM Usage**: Running VS Code + Postman + DBeaver + Terminal + Chrome eats 4 GB to 6 GB of RAM easily, making laptops heat up and slow down. DevDesk runs as a single lightweight client consuming around 350 MB.
2. **Too Much Tab Switching**: Developers lose focus constantly switching between 6 different windows just to run a script, test an endpoint, or check a git diff.
3. **Stuck Ports & Zombie Servers**: Often servers crash in the background and hold port 3000 or 5000. DevDesk automatically detects which ports are occupied and lets you stop them in one click.
4. **Data Privacy**: Online API testers or cloud tools often sync private keys or queries to external servers. DevDesk keeps everything strictly on the local machine (`127.0.0.1`).

---

## 3. Tech Stack Used

- **Desktop Shell**: **Electron** (Mac desktop app wrapper)
- **Frontend UI**: **Next.js 16** + **React 19** + **Tailwind CSS** (Midnight Slate dark theme)
- **Backend**: **Node.js** + **Express** (runs locally on port `5001` or fallback port)
- **Local Storage**: **SQLite** (stores saved workspaces and project history locally in `~/Library/Application Support/DevDesk/devdesk.db`)
- **Package Manager**: **pnpm** (Monorepo setup)

---

## 4. Key Features & How They Work (Point-by-Point)

### 1. Workspace & Project Scanner
- **What it does**: You select any folder on your Mac (like `Projects` or `Downloads`), and DevDesk scans all projects inside it automatically.
- **How it works**: Uses a recursive directory scanner (up to 4 folders deep), finds `package.json` files, identifies project types (React, Next.js, Express, Python, etc.), and lets you open any project directly in VS Code or Finder with 1 click.

### 2. Script Runner & Live Terminal
- **What it does**: Reads your project scripts (like `dev`, `build`, `start`, `test`) and shows them in a clean horizontal bar. You click **Start**, and it runs the script with live colorized logs right inside the app.
- **How it works**: Spawns background child processes using Node `child_process.spawn`. Keeps the last 1,000 log lines in a circular memory buffer so the app doesn't slow down, and lets you restart or stop the server cleanly.

### 3. Port & Process Manager (with In-App Browser)
- **What it does**: Automatically checks which ports (like `:3000`, `:5000`) are active. You can open the server in your default browser, or view it directly inside an in-app interactive web preview.
- **How it works**: Runs the system `lsof` command in the background to detect open TCP ports without freezing the UI. Only tracks processes started by DevDesk so system processes are not disturbed. The in-app preview has Desktop, Tablet, and Mobile viewport options.

### 4. Git Control & Push
- **What it does**: Shows your current Git branch, changed files, line-by-line diffs (green for added lines, red for removed lines), lets you stage files, make commits, and push/pull from GitHub.
- **How it works**: Runs local `git` commands (`git status`, `git diff`, `git add`, `git commit`, `git push`) targeting the exact repository root. Also includes a **"Stage All & Commit"** and **"Commit & Push 🚀"** button so commits don't get blocked when 0 files are staged.

### 5. API Tester (Postman Alternative)
- **What it does**: Lets you test REST APIs directly inside DevDesk. Supports `GET`, `POST`, `PUT`, `DELETE`, `PATCH` with query parameters, custom headers, and JSON body.
- **How it works**: Sends HTTP requests using Node.js backend (avoiding browser CORS issues), formats the JSON response, shows status code (`200 OK`, `404`, etc.), response size, and time taken in milliseconds.

### 6. Environment (.env) Variables Editor
- **What it does**: Opens and edits `.env`, `.env.local`, `.env.production` files safely with password/token masking (eye icon toggle) so secrets aren't exposed on screen.
- **How it works**: Custom parser that keeps all comments and empty spacing intact. Before saving, it automatically creates a `.bak` backup file and writes atomically to prevent file corruption.

### 7. Database Viewer (PostgreSQL & MySQL)
- **What it does**: Connects to your local PostgreSQL or MySQL database, shows tables, column schemas (primary keys, types), and lets you run queries to inspect data.
- **How it works**: Connects via `pg` and `mysql2` drivers. **Safety feature**: Uses an SQL AST parser that only allows safe read-only queries (`SELECT`, `SHOW`). It automatically blocks accidental destructive queries like `DROP TABLE` or `DELETE`. Passwords are kept only in RAM for the active connection and are never saved to disk.

---

## 5. System Architecture (How it Works Internally)

```text
+--------------------------------------------------------------+
|                    DevDesk Desktop App (macOS)               |
|                                                              |
|   [ Electron Main Process ]                                  |
|   - Native Folder Picker (dialog)                            |
|   - Window controls & app:// protocol                        |
|   - Auto-launches Express backend                            |
|                                                              |
|   [ Frontend: Next.js 16 + React 19 ]                        |
|   - Clean Midnight Slate dark theme                          |
|   - Tabs: Projects, Terminal, Services, Git, API, Env, DB    |
|   - In-app responsive web preview (Desktop / Tablet / Mobile)|
|                                                              |
|   [ Backend: Node.js + Express (127.0.0.1:5001) ]           |
|   - Runs local Git commands & process runner                 |
|   - Checks listening ports using lsof                        |
|   - Safe read-only SQL parser                                |
|   - Stores workspaces in SQLite database                     |
+--------------------------------------------------------------+
```

---

## 6. Project Status & Deliverables

1. **Mac Application Installer (DMG)**:
   - Self-contained `.dmg` installer for Apple Silicon Macs (~140 MB).
   - Bundles all 129 production dependencies inside `Contents/Resources/backend` so it works out of the box without installing Node or running terminal commands.
   - Download Link: [Google Drive DevDesk DMG Link](https://drive.google.com/drive/folders/1raRV1BxgL3lI7Tz-kflxTMlECMHlPDvK?usp=sharing)
2. **GitHub Repository**:
   - Complete TypeScript source code: [https://github.com/MAYANKSHARMA01010/DevDesk](https://github.com/MAYANKSHARMA01010/DevDesk)
3. **Documentation Suite**:
   - `docs/ARCHITECTURE.md` (System design & security details)
   - `docs/DEVELOPMENT_GUIDE.md` (How to run locally with `pnpm run dev`)
   - `docs/PACKAGING_AND_RELEASES.md` (How standalone DMG was packaged)
   - `docs/AI_DEVELOPMENT_HISTORY.md` (Complete prompt & development conversation history)
