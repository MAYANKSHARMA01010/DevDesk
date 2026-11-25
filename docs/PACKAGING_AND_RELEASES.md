# Packaging and testing DevDesk

This repository currently builds DevDesk 1.0.1 for **Apple Silicon macOS (arm64)**.
The DMG is a local evaluation build without Developer ID signing or notarization.
Intel, Windows, and Linux packages are not configured or verified.

## Build

On an Apple Silicon Mac with Node.js 22 LTS or newer and pnpm 11.24.0:

```bash
pnpm install --frozen-lockfile
pnpm run package:mac
```

Run from the repository root. Do not use the desktop package's packaging command
alone after source changes: it does not prepare the frontend or backend.
Installation and packaging may download dependencies, Electron, and builder tools;
there is no offline-build guarantee.

The root packaging script:

1. Synchronizes development configuration.
2. Builds the Next.js static export, explicitly targeting the bundled API at
   `http://127.0.0.1:8300` and overriding hosted frontend URLs.
3. Compiles the Electron and backend TypeScript.
4. Recreates `.packaging/backend` using a production-only pnpm deployment.
5. Removes top-level environment files and database state from that staging area;
   electron-builder additionally excludes environment and database files.
6. Includes the backend and `frontend/out` as application resources. The after-pack
   hook copies production dependencies and removes dangling CLI symlinks.
7. Generates the macOS app, DMG, ZIP, and blockmaps with electron-builder.

Native SQLite binaries built for host Node are not copied. The packaged runtime
can use its built-in `node:sqlite` fallback. No Node.js or pnpm installation is
required merely to launch the finished app. Running workspace scripts still needs
the project's usual tools on the test Mac.

## Outputs

| Path | Purpose |
| --- | --- |
| `release/DevDesk-1.0.1-arm64.dmg` | Installer with Applications shortcut |
| `release/DevDesk-1.0.1-arm64-mac.zip` | Zipped application bundle |
| `release/mac-arm64/DevDesk.app` | Unpacked app for diagnostics |

Sizes depend on the build. These paths are generated and ignored by Git.
`release/SHA256SUMS.txt`, when generated during verification, records checksums
for the current DMG and ZIP. Recreate it whenever rebuilding artifacts.

## Install

1. Quit any earlier DevDesk instance and source backend using port 8300.
2. Double-click the DMG.
3. Drag DevDesk into Applications. Replace an earlier copy only if intended.
4. Eject the DMG and launch `/Applications/DevDesk.app`.

The bundled backend listens on `127.0.0.1:8300`. Startup may reuse a healthy
DevDesk backend already there, so stop source servers when checking that the app
is self-contained. An unrelated listener produces a conflict error; the app does
not kill it or select a dynamic port.

## First launch

If macOS blocks this local, unnotarized build, attempt opening it once, then use
**System Settings → Privacy & Security → Open Anyway** if that option is offered.
Control-click → Open may also work depending on the macOS version. Only allow the
copy you built or otherwise trust. Successful ad-hoc signature verification does
not imply Apple notarization or Gatekeeper approval.

## Verify the artifact

```bash
hdiutil verify release/DevDesk-1.0.1-arm64.dmg
codesign --verify --deep --strict --verbose=2 release/mac-arm64/DevDesk.app
shasum -a 256 release/DevDesk-1.0.1-arm64.dmg release/DevDesk-1.0.1-arm64-mac.zip
```

Mount the DMG read-only and verify it contains the app plus `/Applications` link.
Launch a copy outside the repository with no source servers running and check:

```bash
curl --fail http://127.0.0.1:8300/health
curl --fail http://127.0.0.1:8300/api/workspaces
```

An automated startup check should use a temporary `DEVDESK_DATA_DIR`, so it cannot
change your saved workspaces. These commands alone do not verify rendering or
feature behavior.

## Manual acceptance checklist

The following are tasks to perform on the installed build, not claims that all
features have been verified:

- [ ] Launch from Applications after ejecting the DMG, with source servers stopped.
- [ ] Confirm the main interface loads and Settings reports a healthy local API.
- [ ] Pick a disposable workspace and confirm projects and scripts are detected.
- [ ] Run a harmless script; inspect logs, then stop it and check its listener closes.
- [ ] Confirm Finder/editor actions work with the tools installed on your Mac.
- [ ] Inspect Git changes in a disposable repository; test commits/remotes separately.
- [ ] Send an API request to a test endpoint and inspect the response.
- [ ] Edit a disposable `.env` file and verify its backup.
- [ ] Connect to a test database using a read-only account and inspect table data.
- [ ] Quit and relaunch; confirm workspace persistence and managed-service cleanup.

SQLite data lives under `~/Library/Application Support/DevDesk/`. Back it up before
resetting state. For current build-specific results, see `release/TEST_RESULTS.md`
when present. Historical reports and old download folders are not evidence for
the current artifact.

## Versioning and publishing

Versions follow `major.minor.patch`: major for incompatible changes, minor for
backward-compatible features, patch for compatible fixes. The current 1.0.1 release
contains fixes to the existing 1.0.0 app. Render and Neon are not needed to share
the standalone installer.

```bash
pnpm run version:bump patch   # or minor / major, chosen from the actual change
pnpm run version:check
pnpm run check
pnpm run package:mac
```

The bump command updates all four workspace manifests. Build-time frontend version
and backend diagnostics read their package version; Electron reads the desktop
manifest. Update this guide's artifact filenames and the changelog when bumping.
Publish the tested commit as Git tag `v<version>` and a GitHub release carrying
the DMG, ZIP, checksums, and test results. Never silently overwrite an existing tag
or published artifact; publish another patch version for subsequent fixes.
