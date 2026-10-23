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
const backendUrl = rootEnv.get("NEXT_PUBLIC_BACKEND_URL") || rootEnv.get("BACKEND_URL") || "http://localhost:5001";
const frontendPort = rootEnv.get("NEXT_PUBLIC_PORT") || rootEnv.get("FRONTEND_PORT") || "3000";
const isHosted = !/^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(backendUrl);

console.log(`[DevDesk Env Sync] Target Backend: ${backendUrl} (${isHosted ? "Hosted Cloud" : "Local"})`);

// 1. Sync frontend/.env and frontend/.env.local
const frontendEnvPath = path.join(rootDir, "frontend/.env");
const frontendEnvLocalPath = path.join(rootDir, "frontend/.env.local");

const frontendContent = `# Auto-synced from root .env\nNEXT_PUBLIC_BACKEND_URL=${backendUrl}\nNEXT_PUBLIC_PORT=${frontendPort}\nNEXT_PUBLIC_APP_NAME=DevDesk\nNEXT_PUBLIC_APP_VERSION=1.0.0\n`;
fs.writeFileSync(frontendEnvPath, frontendContent);
fs.writeFileSync(frontendEnvLocalPath, frontendContent);
console.log("✓ Synced frontend/.env and frontend/.env.local");

// 2. Sync desktop/.env
const desktopEnvPath = path.join(rootDir, "desktop/.env");
const desktopContent = `# Auto-synced from root .env\nBACKEND_URL=${backendUrl}\nNEXT_PUBLIC_BACKEND_URL=${backendUrl}\nELECTRON_START_URL=http://localhost:${frontendPort}\nHOSTED_BACKEND=${isHosted}\n`;
fs.writeFileSync(desktopEnvPath, desktopContent);
console.log("✓ Synced desktop/.env");

console.log("[DevDesk Env Sync] Environment synchronization complete!");
