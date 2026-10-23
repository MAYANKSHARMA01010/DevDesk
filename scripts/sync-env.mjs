#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

const rootEnvPath = path.join(rootDir, ".env");
if (!fs.existsSync(rootEnvPath)) {
  console.log("[DevDesk Env Sync] No root .env found. Creating from .env.example...");
  const examplePath = path.join(rootDir, ".env.example");
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, rootEnvPath);
  }
}

function parseEnv(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      let v = trimmed.slice(eqIdx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      map.set(k, v);
    }
  }
  return map;
}

const rootEnv = parseEnv(rootEnvPath);

// Dual Backend URLs (Hosted and Local API)
const hostedApiUrl =
  rootEnv.get("NEXT_PUBLIC_HOSTED_API_URL") ||
  rootEnv.get("HOSTED_API_URL") ||
  rootEnv.get("NEXT_PUBLIC_HOSTED_BACKEND_URL") ||
  rootEnv.get("HOSTED_BACKEND_URL") ||
  "";

const localApiUrl =
  rootEnv.get("NEXT_PUBLIC_API_URL") ||
  rootEnv.get("API_URL") ||
  rootEnv.get("NEXT_PUBLIC_LOCAL_API_URL") ||
  rootEnv.get("LOCAL_API_URL") ||
  rootEnv.get("NEXT_PUBLIC_LOCAL_BACKEND_URL") ||
  rootEnv.get("LOCAL_BACKEND_URL") ||
  rootEnv.get("NEXT_PUBLIC_BACKEND_URL") ||
  rootEnv.get("BACKEND_URL") ||
  "http://localhost:5001";

const frontendPort =
  rootEnv.get("NEXT_PUBLIC_PORT") ||
  rootEnv.get("PORT_FRONTEND") ||
  rootEnv.get("FRONTEND_PORT") ||
  "3000";

// Active target URL: Hosted takes precedence via OR (||); falls back to local API URL
const activeBackendUrl = hostedApiUrl || localApiUrl;
const isHosted = Boolean(hostedApiUrl) || !/^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(activeBackendUrl);

console.log(`[DevDesk Env Sync] Active Target Backend: ${activeBackendUrl} (${isHosted ? "Hosted" : "Local"})`);

// Safety check: Explicitly remove any .env.local file if it exists
const frontendEnvLocalPath = path.join(rootDir, "frontend/.env.local");
if (fs.existsSync(frontendEnvLocalPath)) {
  fs.unlinkSync(frontendEnvLocalPath);
  console.log("✓ Removed unwanted frontend/.env.local (DevDesk strictly uses .env only)");
}

// 1. Sync frontend/.env ONLY (never .env.local)
const frontendEnvPath = path.join(rootDir, "frontend/.env");
const frontendContent = `# Auto-synced from root .env
NEXT_PUBLIC_HOSTED_API_URL=${hostedApiUrl}
NEXT_PUBLIC_API_URL=${localApiUrl}
NEXT_PUBLIC_PORT=${frontendPort}
`;
fs.writeFileSync(frontendEnvPath, frontendContent);
console.log("✓ Synced frontend/.env");

// 2. Sync desktop/.env
const desktopEnvPath = path.join(rootDir, "desktop/.env");
const desktopContent = `# Auto-synced from root .env
NEXT_PUBLIC_HOSTED_API_URL=${hostedApiUrl}
NEXT_PUBLIC_API_URL=${localApiUrl}
ELECTRON_START_URL=http://localhost:${frontendPort}
`;
fs.writeFileSync(desktopEnvPath, desktopContent);
console.log("✓ Synced desktop/.env");

console.log("[DevDesk Env Sync] Environment synchronization complete!");
