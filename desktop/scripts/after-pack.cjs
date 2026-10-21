const fs = require("fs");
const path = require("path");

exports.default = async function (context) {
  console.log("\n[DevDesk afterPack] Post-processing application bundle...");
  const appOutDir = context.appOutDir;
  const isMac = context.electronPlatformName === "darwin";
  
  let resourcesDir;
  if (isMac) {
    const appBundleName = `${context.packager.appInfo.productFilename}.app`;
    resourcesDir = path.join(appOutDir, appBundleName, "Contents/Resources");
  } else {
    resourcesDir = path.join(appOutDir, "resources");
  }

  console.log("[DevDesk afterPack] Target Resources directory:", resourcesDir);

  const candidates = [
    path.resolve(__dirname, "../../.packaging/backend/node_modules"),
    path.resolve(__dirname, "../.packaging/backend/node_modules"),
    path.resolve(__dirname, ".packaging/backend/node_modules"),
    path.resolve(process.cwd(), ".packaging/backend/node_modules"),
  ];
  const sourceModules = candidates.find((p) => fs.existsSync(p));
  const targetModules = path.join(resourcesDir, "backend/node_modules");

  if (sourceModules) {
    console.log("[DevDesk afterPack] Found backend production node_modules at:", sourceModules);
    console.log("[DevDesk afterPack] Copying backend production node_modules into app bundle...");
    if (fs.existsSync(targetModules)) {
      fs.rmSync(targetModules, { recursive: true, force: true });
    }
    fs.cpSync(sourceModules, targetModules, { recursive: true });

    // Remove .bin directory since CLI wrapper symlinks point to build-time transient directories
    const binDir = path.join(targetModules, ".bin");
    if (fs.existsSync(binDir)) {
      fs.rmSync(binDir, { recursive: true, force: true });
    }

    // Clean any remaining dangling symlinks defensively
    function cleanDangling(dir) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) {
          try {
            fs.realpathSync(full);
          } catch {
            fs.unlinkSync(full);
          }
        } else if (entry.isDirectory()) {
          cleanDangling(full);
        }
      }
    }
    cleanDangling(targetModules);

    console.log("[DevDesk afterPack] Successfully bundled backend node_modules!");
  } else {
    console.warn("[DevDesk afterPack] WARNING: backend node_modules not found in candidates:", candidates);
  }
};
