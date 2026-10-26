import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

console.log("=== DevDesk Packaging Preparation ===");
console.log("Root directory:", rootDir);

// 0. Sync environment variables
console.log("\n[0/5] Synchronizing environment configuration...");
execSync("node scripts/sync-env.mjs", { cwd: rootDir, stdio: "inherit" });

// 1. Build Frontend static export
console.log("\n[1/5] Building Frontend static export (Next.js)...");
execSync("pnpm --filter frontend run build", { cwd: rootDir, stdio: "inherit" });

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

if (!fs.existsSync(path.join(backendDeployDir, "node_modules"))) {
  if (fs.existsSync(backendDeployDir)) {
    fs.rmSync(backendDeployDir, { recursive: true, force: true });
  }
  fs.mkdirSync(backendDeployDir, { recursive: true });
  execSync(`pnpm --filter=backend deploy "${backendDeployDir}" --prod --legacy --node-linker=hoisted --ignore-scripts`, {
    cwd: rootDir,
    stdio: "inherit",
  });
  // Restore workspace devDependencies in case pnpm deploy touched root
  execSync("pnpm install --prod=false", { cwd: rootDir, stdio: "inherit" });
}

const deployDistDir = path.join(backendDeployDir, "dist");
fs.cpSync(backendDist, deployDistDir, { recursive: true });
try {
  fs.copyFileSync(path.join(rootDir, "backend/package.json"), path.join(backendDeployDir, "package.json"));
} catch {}

// Copy prebuilt sqlite addon if present
const prebuiltSqlite = path.join(rootDir, "node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3/build");
const deploySqliteBuild = path.join(backendDeployDir, "node_modules/better-sqlite3/build");
if (fs.existsSync(prebuiltSqlite) && !fs.existsSync(deploySqliteBuild)) {
  try {
    fs.cpSync(prebuiltSqlite, deploySqliteBuild, { recursive: true });
  } catch {}
}
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
