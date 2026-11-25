#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifests = ["package.json", "frontend/package.json", "backend/package.json", "desktop/package.json"];
const packages = manifests.map(file => ({ file, data: JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) }));
const current = packages[0].data.version;
const action = process.argv[2] || "check";
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(current)) throw new Error("Use a stable major.minor.patch version");
for (const { file, data } of packages) {
  if (data.version !== current) throw new Error(`${file}: ${data.version} differs from ${current}`);
}
if (action === "check") {
  console.log(`All packages use ${current}`);
} else {
  if (!["major", "minor", "patch"].includes(action)) throw new Error("Usage: node scripts/version.mjs [check|major|minor|patch]");
  const version = current.split(".").map(Number);
  const index = ["major", "minor", "patch"].indexOf(action);
  version[index]++;
  for (let i = index + 1; i < version.length; i++) version[i] = 0;
  const next = version.join(".");
  for (const { file, data } of packages) {
    data.version = next;
    fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2) + "\n");
  }
  console.log(`${current} → ${next}. Update the changelog before publishing v${next}.`);
}
