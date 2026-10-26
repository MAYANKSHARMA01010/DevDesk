# DevDesk — Production Packaging & Release Engineering 📦🚀

> **Target Platform**: macOS (Apple Silicon `arm64` & Intel `x64`)  
> **Package Format**: Apple Disk Image (`.dmg`) & Standalone Application Bundle (`.app`)  
> **Official Direct Download**: [Google Drive DMG Link](https://drive.google.com/drive/folders/1raRV1BxgL3lI7Tz-kflxTMlECMHlPDvK?usp=sharing)

---

## 1. Packaging Architecture Overview

Unlike standard web applications, DevDesk operates as a **100% self-contained desktop system**. When packaged for production distribution, the application bundle contains:

1. **Native Electron Runtime**: Chromium display engine + Node.js runtime.
2. **Static Frontend UI**: Next.js App Router pre-compiled to static HTML, CSS, and client-side JavaScript, served via the privileged `app://devdesk/` protocol.
3. **Isolated Standalone Backend**: A production-ready Express service bundled with all 129 production dependencies in `Resources/backend`, completely decoupled from pnpm symlinks.
4. **Embedded SQLite Engine**: Zero cloud database requirement; initializes `devdesk.db` in macOS `Application Support`.

---

## 2. Resolving the Monorepo Packaging Challenge

In a `pnpm` monorepo, dependencies are stored in a centralized content-addressable store and linked into workspace packages via symbolic links. 

Naive packaging via standard `electron-builder` fails in monorepos because:
- Symbolic links outside the package directory are broken when copied into `.app/Contents/Resources`.
- Native C++ addons (like `better-sqlite3`) fail to locate dynamic libraries inside `app.asar`.
- Monorepo package manifests contain workspace protocol references (`workspace:*`) which cause Node resolution failures at runtime.

### The Solution: `prepare-packaging.mjs` Orchestrator
To solve this, DevDesk utilizes an automated pre-packaging pipeline (`scripts/prepare-packaging.mjs`) that executes prior to `electron-builder`:

1. **Frontend Static Compilation**: Invokes `next build` inside `frontend/` to output static assets directly to `frontend/out/`.
2. **Backend TypeScript Compilation**: Emits compiled JavaScript to `backend/dist/`.
3. **Isolated Production Deployment**: Runs `pnpm --filter=backend deploy --prod --ignore-scripts .packaging/backend` to resolve and flatten all 129 production dependencies into a real, non-symlinked directory.
4. **Asset Synchronization**: Copies `backend/dist` into `.packaging/backend/dist` and ensures valid `package.json` manifests.
5. **Electron Builder ExtraResources**: Maps `.packaging/backend` to `Contents/Resources/backend` and `frontend/out` to `Contents/Resources/frontend` in the final DMG.

---

## 3. Building the Production Package

Run the automated packaging pipeline from the workspace root:

```bash
pnpm run package:mac
```

### Generated Artifacts
Upon completion, the distribution artifacts are generated in the `release/` directory:

| Artifact | Architecture | File Size | Description |
| :--- | :---: | :---: | :--- |
| **`DevDesk-1.0.0-arm64.dmg`** | Apple Silicon (`arm64`) | `~140 MB` | macOS Disk Image with Applications drag-and-drop installer. |
| **`DevDesk-1.0.0-arm64-mac.zip`** | Apple Silicon (`arm64`) | `~140 MB` | Compressed ZIP archive for direct extraction. |
| **`DevDesk.app`** | Apple Silicon (`arm64`) | Directory | Unpacked macOS application bundle (`release/mac-arm64/`). |

---

## 4. Installation & First Launch (macOS)

1. **Download the Disk Image**:
   Download the latest build from the [Google Drive DMG Link](https://drive.google.com/drive/folders/1raRV1BxgL3lI7Tz-kflxTMlECMHlPDvK?usp=sharing).
2. **Mount the DMG**: Double-click `DevDesk-1.0.0-arm64.dmg`.
3. **Install**: Drag the **DevDesk** icon into the **Applications** folder shortcut.
4. **Launch**: Open DevDesk from Spotlight, Launchpad, or `/Applications`.

---

## 5. Handling macOS Gatekeeper & Unsigned Builds

Because this release is built for developer evaluation and has not been notarized with a commercial paid Apple Developer certificate, macOS Gatekeeper may present a security prompt on first launch:

> *"DevDesk.app cannot be opened because the developer cannot be verified."*

### Standard Resolution Methods

#### Method A: Finder Right-Click (GUI)
1. Open Finder and navigate to `/Applications`.
2. **Right-click** (or `Control`-click) on **DevDesk.app**.
3. Select **Open** from the context menu.
4. In the confirmation dialog, click **Open**. macOS will store this approval permanently.

#### Method B: Terminal Quarantine Clear (CLI)
To remove the quarantine flag directly from the terminal:
```bash
xattr -cr /Applications/DevDesk.app
```
DevDesk will subsequently launch normally.

---

## 6. Pre-Release Verification Protocol

Before publishing a release, verify:
- [x] Packaging runs completely offline without requiring internet access.
- [x] Clean install in `/Applications` launches without requiring any existing dev servers.
- [x] Backend automatically initializes on `127.0.0.1:5001` or fallback port.
- [x] Native folder picker (`dialog:select-directory`) opens correctly.
- [x] Script execution streams live logs in the Terminal view.
- [x] Process and port detector identifies active TCP listeners.
- [x] Git staging, committing, and pushing execute without errors.
- [x] API Tester sends requests and formats responses.
- [x] SQLite database creates cleanly in `~/Library/Application Support/DevDesk/`.
