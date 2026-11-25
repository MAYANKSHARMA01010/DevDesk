# DevDesk

DevDesk is a macOS developer workspace app built with Electron, Next.js, React,
TypeScript, Express, and SQLite. It brings project discovery, package scripts,
process logs, Git, HTTP requests, environment files, and database browsing into
one desktop window.

## Install a local test build

The current packaging command produces an **Apple Silicon (arm64)** installer.
Intel, Windows, and Linux installers are not configured or verified.

1. Download the [v1.0.2 installer](https://github.com/MAYANKSHARMA01010/DevDesk/releases/download/v1.0.2/DevDesk-1.0.2-arm64.dmg),
   or build `release/DevDesk-1.0.2-arm64.dmg` locally.
2. Open the DMG and drag **DevDesk.app** onto **Applications**.
3. Eject the installer, then launch DevDesk from Applications.

The app includes its frontend, backend, Electron runtime, and SQLite support.
Node.js, pnpm, and running development servers are not required on the test Mac.
This is a local developer build without Developer ID signing or Apple notarization.
Starting the app automatically stops other TCP listeners on its backend port
(default 8300) so the bundled backend can use it.
If macOS blocks it, follow [first-launch troubleshooting](docs/PACKAGING_AND_RELEASES.md#first-launch).

## Features

- Scan workspace folders and detect project types, package managers, and scripts.
- Run project package scripts, inspect bounded logs, and stop managed processes.
- Inspect listening TCP ports and open local services.
- Inspect Git changes, stage files, commit, and sync with remotes.
- Send HTTP requests with headers, query parameters, and JSON bodies.
- View and edit project environment files with masking and backups.
- Connect to PostgreSQL or MySQL, browse tables, and run queries through a
  read-only SQL validator. Use a database account with read-only permissions too.
- Inspect application diagnostics and local storage paths in Settings.

Git operations, scripts, environment edits, API requests, and process termination
can change files or external systems. Test these features with disposable projects.
The Terminal view runs project scripts; it is not a general interactive terminal.

## Develop from source

Use an Apple Silicon Mac, Node.js 22 LTS or newer, pnpm 11.24.0, and Git.
Xcode Command Line Tools may be needed to build native dependencies.

```bash
cd DevDesk
pnpm install --frozen-lockfile
cp .env.example .env  # only if .env does not already exist
pnpm run build
pnpm run dev
```

Default development URLs are `http://localhost:8200` for Next.js and
`http://127.0.0.1:8300` for the API. Root `.env` is synchronized into the three
packages by the development scripts. The frontend's `dev` command fixes its port
at 8200; keep `NEXT_PUBLIC_PORT=8200` unless changing that script too.

**Development port cleanup:** `pnpm run dev`, `dev:frontend`, `dev:backend`, and
`free:ports` invoke a utility that force-terminates conflicting listeners and may
terminate their runner parents. Inspect occupied ports before using these commands.
For starting services without automatic cleanup, see the
[development guide](docs/DEVELOPMENT_GUIDE.md).

## Build the DMG

From the repository root, after installing dependencies:

```bash
pnpm run package:mac
```

The command builds all three packages, creates a fresh production backend bundle,
and runs electron-builder. It emits:

- `release/DevDesk-1.0.2-arm64.dmg` — drag-to-Applications installer.
- `release/DevDesk-1.0.2-arm64-mac.zip` — zipped application.
- `release/mac-arm64/DevDesk.app` — unpacked application.

The installer targets the bundled local API at `127.0.0.1:8300`, regardless of a
hosted URL in the developer's `.env`. Build tools or runtime downloads may need
internet access. File sizes vary; see [packaging and testing](docs/PACKAGING_AND_RELEASES.md).

## Data and network behavior

Workspace metadata and saved database connection profiles are stored in
`~/Library/Application Support/DevDesk/devdesk.db`. Database passwords are held in
active process memory rather than saved connection profiles. Environment files
and their backups still contain their original values on disk.

The bundled backend listens on loopback. The local API has no authentication and
permits cross-origin requests; loopback alone is not a security boundary against
other local software or untrusted browser content. Use a trusted machine and test
projects. Git remotes, HTTP requests, external databases, previews, and project
scripts can access the network. Source development also supports a hosted backend.
Do not expose this powerful API publicly without additional security work.

## Documentation

- [Development guide](docs/DEVELOPMENT_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Packaging, installation, and test checklist](docs/PACKAGING_AND_RELEASES.md)
- [Faculty project report](docs/FACULTY_PROJECT_REPORT.md) — historical project write-up.
- [AI development history](docs/AI_DEVELOPMENT_HISTORY.md) — historical notes.
- [Changelog](CHANGELOG.md)

Historical documents describe earlier builds; the guides above and current source
are the reference for this testing build.

## License

[MIT](LICENSE), copyright 2026 Mayank Sharma.
