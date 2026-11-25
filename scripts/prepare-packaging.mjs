import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

execSync("node scripts/version.mjs check", { cwd: rootDir, stdio: "inherit" });
const appVersion = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")).version;

console.log("=== DevDesk Packaging Preparation ===");
console.log("Root directory:", rootDir);

// 0. Sync environment variables
console.log("\n[0/5] Synchronizing environment configuration...");
execSync("node scripts/sync-env.mjs", { cwd: rootDir, stdio: "inherit" });

// 1. Build Frontend static export
console.log("\n[1/5] Building Frontend static export (Next.js)...");
execSync("pnpm --filter frontend run build", {
  cwd: rootDir,
  stdio: "inherit",
  // A local testing installer must not embed a developer's hosted API URL.
  env: {
    ...process.env,
    NEXT_PUBLIC_HOSTED_API_URL: "",
    NEXT_PUBLIC_HOSTED_BACKEND_URL: "",
    HOSTED_API_URL: "",
    HOSTED_BACKEND_URL: "",
    NEXT_PUBLIC_API_URL: "http://127.0.0.1:8300",
    NEXT_PUBLIC_PORT: "8200",
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
});

const frontendOut = path.join(rootDir, "frontend/out");
if (!fs.existsSync(frontendOut)) {
  console.error("ERROR: frontend/out was not created.");
  process.exit(1);
}
console.log("✓ Frontend static export verified in frontend/out");

// 2. Build Desktop Electron TypeScript
console.log("\n[2/5] Building Desktop Electron shell...");
execSync("./desktop/node_modules/.bin/tsc -p desktop/tsconfig.json", { cwd: rootDir, stdio: "inherit" });

const desktopDist = path.join(rootDir, "desktop/dist");
if (!fs.existsSync(desktopDist)) {
  console.error("ERROR: desktop/dist was not created.");
  process.exit(1);
}
console.log("✓ Desktop compiled in desktop/dist");

// 3. Package standalone local Backend
console.log("\n[3/5] Packaging standalone local backend...");
execSync("./desktop/node_modules/.bin/tsc -p backend/tsconfig.json", { cwd: rootDir, stdio: "inherit" });
const backendDist = path.join(rootDir, "backend/dist");
const backendDeployDir = path.join(rootDir, ".packaging/backend");

// Always deploy from the current lockfile; a previous bundle may contain stale dependencies.
fs.rmSync(backendDeployDir, { recursive: true, force: true });
execSync(`pnpm --filter=backend deploy "${backendDeployDir}" --prod --legacy --node-linker=hoisted --ignore-scripts`, {
  cwd: rootDir,
  stdio: "inherit",
});
// pnpm legacy deploy can change workspace install state; restore development tools.
execSync("pnpm install --prod=false --frozen-lockfile", { cwd: rootDir, stdio: "inherit" });
// Local configuration and user data never belong in the installer.
for (const entry of fs.readdirSync(backendDeployDir)) {
  if (entry.startsWith(".env") || /\.db(?:-(?:wal|shm))?$/.test(entry)) {
    fs.rmSync(path.join(backendDeployDir, entry), { recursive: true, force: true });
  }
}

const deployDistDir = path.join(backendDeployDir, "dist");
fs.cpSync(backendDist, deployDistDir, { recursive: true });
try {
  fs.copyFileSync(path.join(rootDir, "backend/package.json"), path.join(backendDeployDir, "package.json"));
} catch {}

// Native addons built for the host Node ABI are intentionally not copied.
// The bundled Electron runtime provides node:sqlite when better-sqlite3 is unavailable.
console.log("✓ Standalone production backend deployed to .packaging/backend");

// 4. Ensure application icon
console.log("\n[4/5] Checking macOS application icon...");
const iconPath = path.join(rootDir, "desktop/build-resources/icon.icns");
if (!fs.existsSync(iconPath)) {
  console.log("Generating icon.icns from icon.png...");
  const tempIconset = "/tmp/devdesk_icon.iconset";
  const sourcePng = path.join(rootDir, "desktop/build-resources/icon.png");
  fs.mkdirSync(tempIconset, { recursive: true });
  execSync(`sips -z 16 16 "${sourcePng}" --out "${tempIconset}/icon_16x16.png"`, { stdio: "ignore" });
  execSync(`sips -z 32 32 "${sourcePng}" --out "${tempIconset}/icon_16x16@2x.png"`, { stdio: "ignore" });
  execSync(`sips -z 32 32 "${sourcePng}" --out "${tempIconset}/icon_32x32.png"`, { stdio: "ignore" });
  execSync(`sips -z 64 64 "${sourcePng}" --out "${tempIconset}/icon_32x32@2x.png"`, { stdio: "ignore" });
  execSync(`sips -z 128 128 "${sourcePng}" --out "${tempIconset}/icon_128x128.png"`, { stdio: "ignore" });
  execSync(`sips -z 256 256 "${sourcePng}" --out "${tempIconset}/icon_128x128@2x.png"`, { stdio: "ignore" });
  execSync(`sips -z 256 256 "${sourcePng}" --out "${tempIconset}/icon_256x256.png"`, { stdio: "ignore" });
  execSync(`sips -z 512 512 "${sourcePng}" --out "${tempIconset}/icon_256x256@2x.png"`, { stdio: "ignore" });
  execSync(`sips -z 512 512 "${sourcePng}" --out "${tempIconset}/icon_512x512.png"`, { stdio: "ignore" });
  execSync(`iconutil -c icns "${tempIconset}" -o "${iconPath}"`, { stdio: "ignore" });
  fs.rmSync(tempIconset, { recursive: true, force: true });
}
console.log("✓ macOS icon verified at desktop/build-resources/icon.icns");

console.log("\n=== Preparation Complete! Ready for electron-builder ===");
