# DevDesk — Developer Setup & Engineering Guide 💻🛠️

> **Audience**: Contributors, Maintainers, and Engineers extending DevDesk.  
> **Prerequisites**: macOS 13+, Node.js v20.17+ (`v22+` recommended), `pnpm` v11+.

---

## 1. Prerequisites & Environment

Before setting up DevDesk locally, ensure your machine satisfies:

- **Operating System**: macOS 13.0 (Ventura) or newer (Apple Silicon `arm64` tested & verified; Intel `x64` supported).
- **Node.js**: `v20.17.0` or newer (`v22.13.0` recommended). Check with:
  ```bash
  node -v
  ```
- **pnpm**: `v11.0.0` or newer (`npm install -g pnpm@11.24.0`). Check with:
  ```bash
  pnpm -v
  ```
- **Optional External Tools**:
  - **Visual Studio Code**: Ensure `code` is in your `$PATH` (`Cmd+Shift+P` > *Shell Command: Install 'code' command in PATH*).
  - **Git CLI**: Standard Apple Command Line Tools (`xcode-select --install`).
  - **PostgreSQL / MySQL**: If testing live database connectivity with local daemons.

---

## 2. Monorepo Structure

DevDesk is structured as a `pnpm` workspace monorepo:

```text
DevDesk/
├── backend/                  # Local Express REST API microservice
│   ├── src/
│   │   ├── config/           # SQLite setup, database schema & migrations
│   │   ├── controllers/      # Route request & response handlers
│   │   ├── routes/           # REST API endpoints
│   │   ├── services/         # Core business logic (git, processes, env, db, scanner)
│   │   └── index.ts          # Express server entry point (bound to 127.0.0.1:5001)
│   ├── package.json
│   └── tsconfig.json
├── desktop/                  # Electron desktop shell
│   ├── build-resources/      # Application icons (icon.icns) & DMG background
│   ├── src/
│   │   ├── main.ts           # Main process, app:// protocol, lifecycle runner
│   │   ├── preload.ts        # Typed context-isolated IPC bridge
│   │   └── types.ts          # Shared desktop IPC type definitions
│   ├── electron-builder.yml  # macOS DMG & packaging configuration
│   ├── package.json
│   └── tsconfig.json
├── frontend/                 # Next.js 16 + React 19 UI
│   ├── src/
│   │   ├── app/              # Next.js App Router entry & global styling
│   │   ├── components/       # UI Views (Projects, Terminal, Processes, Git, DB, etc.)
│   │   └── services/         # Client-side API fetch wrappers
│   ├── next.config.ts        # Static export configuration (output: "export")
│   ├── package.json
│   └── tsconfig.json
├── docs/                     # Technical specifications & project history
├── release/                  # Generated DMG and application bundles
├── scripts/
│   └── prepare-packaging.mjs # Production packaging orchestrator
├── pnpm-workspace.yaml       # Monorepo workspace configuration
├── package.json              # Root build & coordination scripts
└── README.md                 # Primary project overview
```

---

## 3. Quick Start & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/MAYANKSHARMA01010/DevDesk.git
   cd DevDesk
   ```

2. **Install all workspace dependencies**:
   ```bash
   pnpm install
   ```

3. **Verify compilation across all tiers**:
   ```bash
   pnpm run build
   ```

---

## 4. Running in Development

### Option A: Unified Concurrent Runner (Recommended)
Launch all three services (Frontend dev server, Express API, and Electron shell) in a single command:

```bash
pnpm run dev
```

### Option B: Dedicated Terminal Execution
For granular debugging, start each service individually in dedicated terminal tabs:

```bash
# Terminal 1: Backend service (http://127.0.0.1:5001 with tsx hot-reload)
pnpm run dev:backend

# Terminal 2: Frontend Next.js development server (http://localhost:3000)
pnpm run dev:frontend

# Terminal 3: Electron desktop shell (attaches to localhost:3000 in dev)
pnpm run dev:desktop
```

---

## 5. Working on Core Modules

### 5.1 Backend (`backend/`)
- **Adding new REST endpoints**:
  1. Add route definition in `backend/src/routes/<module>.routes.ts`.
  2. Implement business logic in `backend/src/services/<module>/`.
  3. Wire request/response handling in `backend/src/controllers/<module>.controller.ts`.
  4. Register the router in `backend/src/index.ts`.
- **Database Schema Updates**:
  - Modify `backend/src/config/database.ts`. Database tables are initialized with `CREATE TABLE IF NOT EXISTS` upon server launch.

### 5.2 Frontend (`frontend/`)
- **Design Guidelines**:
  - Strictly adhere to the **Midnight Slate** palette defined in `globals.css` and TailwindCSS classes.
  - Background: `#0B0F17` / `#101216` (Deep Slate).
  - Surface/Cards: `#161F30` / `#1D2129`.
  - Borders: `#1F293D` / `#303642`.
  - Primary Accents: `#3B82F6` (Electric Blue) and `#8CA9CF` (Periwinkle).
  - Status Indicators: Emerald (`#10B981`) for running, Rose (`#F43F5E`) for failed/stopped, Amber (`#F59E0B`) for warnings.
- **Client API Calls**:
  - Keep fetch calls encapsulated in `frontend/src/services/api.ts` to ensure consistent base URLs and error handling.

### 5.3 Desktop Shell (`desktop/`)
- **Adding IPC Methods**:
  1. Define TypeScript interface in `desktop/src/types.ts`.
  2. Implement IPC listener via `ipcMain.handle()` in `desktop/src/main.ts`.
  3. Safely expose via `contextBridge.exposeInMainWorld('electronAPI', ...)` in `desktop/src/preload.ts`.

---

## 6. Common Development Issues & Troubleshooting

### Port 5001 Already Bound
If another process is using port 5001:
```bash
lsof -i :5001
kill -9 <PID>
```
*Note: DevDesk also supports automatic dynamic port allocation if port 5001 is unavailable during packaged execution.*

### Resetting Corrupted Application State
To clear the local SQLite database and start fresh:
```bash
rm -f ~/Library/Application\ Support/DevDesk/devdesk.db*
```
DevDesk will automatically recreate the database schema upon next launch.
