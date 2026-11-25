# DevDesk frontend

Next.js App Router, React, TypeScript, and Tailwind CSS frontend for the Electron
app. Run commands from the repository root using pnpm.

```bash
pnpm run sync:env
pnpm --filter backend dev   # separate terminal
pnpm --filter frontend dev
```

The development frontend is at `http://localhost:8200`; the synced backend uses
port 8300. Start the Electron shell with `pnpm --filter desktop dev` after both
servers are ready. Root `.env` controls the API configuration; do not edit generated
package `.env` files or rely on `.env.local`, which synchronization removes.

```bash
pnpm --filter frontend build
pnpm --filter frontend lint
```

Production uses `output: "export"`. Electron serves `out/` over its `app://`
protocol; `next start` and deployment to Vercel are not the desktop release flow.
Feature views are in `src/features`, HTTP clients in `src/services`, and backend
configuration in `src/config/env.ts`.

See the [development guide](../docs/DEVELOPMENT_GUIDE.md) and
[packaging guide](../docs/PACKAGING_AND_RELEASES.md). Follow `AGENTS.md` and the
repository's UI workflow when changing screens.
