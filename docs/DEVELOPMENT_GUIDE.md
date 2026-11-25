# DevDesk development guide

## Requirements

The packaging target is macOS Apple Silicon (arm64). Use Node.js 22 LTS or newer,
pnpm 11.24.0 (as pinned in `package.json`), Git, and optionally Xcode Command Line
Tools for native dependency builds. PostgreSQL/MySQL servers are only needed for
testing those integrations. This guide does not claim Intel support.

## Setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env  # skip if already configured
pnpm run sync:env
pnpm run build
```

Run commands from the repository root. `sync:env` writes `frontend/.env`,
`backend/.env`, and `desktop/.env` from root configuration. It also removes
`frontend/.env.local`; keep your DevDesk configuration in the root `.env`.
Never commit real credentials.

## Run the app

`pnpm run dev` starts all packages in parallel. It first invokes the port cleanup
utility, which can force-kill listeners and runner parents. The desktop may start
before Next.js is ready; use the retry action after the server has started.

For controlled startup without that cleanup, run these in separate terminals:

```bash
# First synchronize configuration once:
pnpm run sync:env

# Terminal 1
pnpm --filter backend dev

# Terminal 2
pnpm --filter frontend dev

# Terminal 3, after the frontend is ready
pnpm --filter desktop dev
```

Defaults: frontend `http://localhost:8200`, backend `http://127.0.0.1:8300`.
The backend's direct source fallback without a synced `.env` is port 5001;
the root scripts set 8300. Next.js's development script fixes port 8200, so changing
`NEXT_PUBLIC_PORT` alone does not move the Next.js server.

Root `.env` supports `NEXT_PUBLIC_HOSTED_API_URL`, `NEXT_PUBLIC_API_URL`, `PORT`,
and `NEXT_PUBLIC_PORT`; see `.env.example`. Hosted URL takes precedence in source
development. The local DMG build explicitly compiles the frontend for
`http://127.0.0.1:8300` and starts its bundled backend there.

## Repository map

| Path | Purpose |
| --- | --- |
| `backend/src/index.ts` | Express setup and health endpoint |
| `backend/src/routes/`, `controllers/`, `services/` | API routes and business logic |
| `backend/src/config/database.ts` | SQLite storage, schema, and driver fallback |
| `desktop/src/main.ts` | Electron lifecycle, IPC, static protocol, backend launch |
| `desktop/src/preload.ts`, `types.ts` | Context-isolated desktop bridge |
| `frontend/src/app/` | Next.js entry points and global styles |
| `frontend/src/features/` | Projects, terminal, Git, API, env, DB, settings views |
| `frontend/src/services/` | Per-feature HTTP clients |
| `frontend/src/config/env.ts` | Frontend backend URL selection |
| `scripts/prepare-packaging.mjs` | Build and production backend staging |
| `desktop/electron-builder.yml` | macOS packaging configuration |

## Checks

```bash
pnpm run build
pnpm --filter backend typecheck
pnpm --filter desktop typecheck
pnpm --filter frontend lint
pnpm run test:backend-port
```

The root and backend `test` scripts are placeholders that exit with failure;
there is no general unit test suite. `pnpm run test:packaged -- /absolute/path/DevDesk.app`
checks an installed bundle using temporary data and ports 18300/19222; those ports
must be free. It drives the Electron renderer through its debug protocol, visits
all main views, and checks SQLite, logs, native IPC, and saved preferences.
Builds/type checks do not establish that
every integration works. Follow the manual checklist in the packaging guide.
The exported frontend is served by Electron's custom protocol; `next start` is not
the production launch path for `output: "export"`.

## Troubleshooting

Inspect ports with `lsof -nP -iTCP:8300 -sTCP:LISTEN` or the equivalent for 8200.
Close only the process you recognize. Packaged startup automatically reclaims its
configured port using SIGTERM and then SIGKILL if necessary. It verifies release
and starts its own backend; there is no dynamic fallback port. It never signals
DevDesk itself or its launcher ancestors.

SQLite data defaults to `~/Library/Application Support/DevDesk/devdesk.db`.
`DEVDESK_DATA_DIR=/absolute/test/path` isolates backend test data. Quit the app and
back up that directory before resetting state. Settings' reset action deletes
saved metadata and connection profiles; it does not delete workspace files.

For release builds and first-launch issues, see
[Packaging and releases](PACKAGING_AND_RELEASES.md).
