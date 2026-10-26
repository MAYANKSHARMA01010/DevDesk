import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from "electron";
import * as path from "path";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as http from "http";
import * as netSocket from "net";
import { spawn, execSync, ChildProcess } from "child_process";
import { pathToFileURL } from "url";
import type { ActionResult } from "./types";

// Register custom privileged scheme before app ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
let backendChild: ChildProcess | null = null;

function loadEnvironment(): void {
  const envCandidates = [
    path.join(__dirname, "../../.env"),
    path.join(__dirname, "../.env"),
    path.join(process.cwd(), ".env"),
    path.join(process.resourcesPath, ".env"),
  ];

  for (const envPath of envCandidates) {
    if (fsSync.existsSync(envPath)) {
      try {
        const content = fsSync.readFileSync(envPath, "utf8");
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch {}
    }
  }
}

loadEnvironment();

const HOSTED_API_URL = (
  process.env.NEXT_PUBLIC_HOSTED_API_URL ||
  process.env.HOSTED_API_URL ||
  process.env.NEXT_PUBLIC_HOSTED_BACKEND_URL ||
  process.env.HOSTED_BACKEND_URL ||
  ""
).trim().replace(/\/+$/, "");

const LOCAL_API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_LOCAL_API_URL ||
  process.env.LOCAL_API_URL ||
  process.env.NEXT_PUBLIC_LOCAL_BACKEND_URL ||
  process.env.LOCAL_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_URL ||
  "http://127.0.0.1:8300"
).trim().replace(/\/+$/, "");

// Hosted takes precedence; falls back to local API URL via OR (||)
const BACKEND_URL = HOSTED_API_URL || LOCAL_API_URL || "http://127.0.0.1:8300";

const IS_HOSTED_BACKEND =
  Boolean(HOSTED_API_URL) ||
  !/^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(BACKEND_URL);

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const FRONTEND_DEV_URL =
  process.env.ELECTRON_START_URL || "http://localhost:8200";

function getOfflineErrorHtml(targetUrl: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>DevDesk - Frontend Server Offline</title>
        <style>
          * { box-sizing: border-box; }
          body {
            background-color: #09090b;
            color: #f4f4f5;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            padding: 24px;
            user-select: none;
          }
          .card {
            background-color: #18181b;
            border: 1px solid #27272a;
            border-radius: 12px;
            padding: 36px 32px;
            max-width: 520px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
          }
          .badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #f87171;
            padding: 4px 12px;
            border-radius: 9999px;
            font-size: 12px;
            font-weight: 500;
            margin-bottom: 16px;
            font-family: monospace;
          }
          h2 {
            margin: 0 0 10px 0;
            font-size: 20px;
            font-weight: 600;
            color: #fafafa;
          }
          p {
            color: #a1a1aa;
            font-size: 13px;
            line-height: 1.6;
            margin: 0 0 20px 0;
          }
          .command-box {
            background-color: #09090b;
            border: 1px solid #27272a;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 24px;
            text-align: left;
          }
          .command-box span {
            font-size: 11px;
            color: #71717a;
            display: block;
            margin-bottom: 6px;
          }
          code {
            color: #34d399;
            font-family: "SF Mono", Monaco, Consolas, monospace;
            font-size: 13px;
          }
          button {
            background-color: #27272a;
            color: #f4f4f5;
            border: 1px solid #3f3f46;
            padding: 9px 18px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
          }
          button:hover {
            background-color: #3f3f46;
            color: #ffffff;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">
            <span>●</span> Frontend Server Not Detected
          </div>
          <h2>Cannot Connect to Next.js</h2>
          <p>
            DevDesk attempted to connect to the local development server at
            <strong style="color: #e4e4e7;">${targetUrl}</strong>, but connection was refused.
          </p>
          <div class="command-box">
            <span>Start the frontend development server:</span>
            <code>pnpm --filter frontend dev</code>
          </div>
          <button onclick="window.location.href='${targetUrl}'">
            Retry Connection
          </button>
        </div>
      </body>
    </html>
  `)}`;
}

function getBackendErrorHtml(title: string, message: string, suggestion: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>DevDesk - Backend Startup Error</title>
        <style>
          * { box-sizing: border-box; }
          body {
            background-color: #09090b;
            color: #f4f4f5;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            padding: 24px;
            user-select: none;
          }
          .card {
            background-color: #18181b;
            border: 1px solid #27272a;
            border-radius: 12px;
            padding: 36px 32px;
            max-width: 540px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
          }
          .badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #f87171;
            padding: 4px 12px;
            border-radius: 9999px;
            font-size: 12px;
            font-weight: 500;
            margin-bottom: 16px;
            font-family: monospace;
          }
          h2 {
            margin: 0 0 10px 0;
            font-size: 20px;
            font-weight: 600;
            color: #fafafa;
          }
          p {
            color: #a1a1aa;
            font-size: 13px;
            line-height: 1.6;
            margin: 0 0 20px 0;
          }
          .command-box {
            background-color: #09090b;
            border: 1px solid #27272a;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 24px;
            text-align: left;
          }
          .command-box span {
            font-size: 11px;
            color: #71717a;
            display: block;
            margin-bottom: 6px;
          }
          code {
            color: #fb7185;
            font-family: "SF Mono", Monaco, Consolas, monospace;
            font-size: 12px;
            word-break: break-all;
          }
          button {
            background-color: #27272a;
            color: #f4f4f5;
            border: 1px solid #3f3f46;
            padding: 9px 18px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
          }
          button:hover {
            background-color: #3f3f46;
            color: #ffffff;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">
            <span>●</span> Service Startup Failure
          </div>
          <h2>${title}</h2>
          <p>${message}</p>
          <div class="command-box">
            <span>Recommended Action:</span>
            <code>${suggestion}</code>
          </div>
          <button onclick="window.location.reload()">
            Retry Startup
          </button>
        </div>
      </body>
    </html>
  `)}`;
}

/**
 * Checks if port is occupied and verifies whether an existing DevDesk service is running.
 */
async function checkPortOccupied(port: number): Promise<{ occupied: boolean; isDevDesk: boolean }> {
  // 1. Quick check against /health (instant, returns status: "ok")
  const isHealthy = await new Promise<boolean>((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 2000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && (parsed.status === "ok" || parsed.app === "DevDesk")) {
            resolve(true);
            return;
          }
        } catch {}
        resolve(false);
      });
    });

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });

  if (isHealthy) {
    return { occupied: true, isDevDesk: true };
  }

  // 2. Secondary check against /api/diagnostics
  const isDiag = await new Promise<boolean>((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/diagnostics`, { timeout: 2000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (
            parsed &&
            (parsed.data?.appName === "DevDesk" ||
              parsed.appName === "DevDesk" ||
              parsed.data?.app === "DevDesk")
          ) {
            resolve(true);
            return;
          }
        } catch {}
        resolve(false);
      });
    });

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });

  if (isDiag) {
    return { occupied: true, isDevDesk: true };
  }

  // 3. Raw TCP check to see if port is open
  return new Promise((resolve) => {
    const socket = new netSocket.Socket();
    socket.setTimeout(800);
    socket.on("connect", () => {
      socket.destroy();
      resolve({ occupied: true, isDevDesk: false });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ occupied: false, isDevDesk: false });
    });
    socket.on("error", () => {
      socket.destroy();
      resolve({ occupied: false, isDevDesk: false });
    });
    socket.connect(port, "127.0.0.1");
  });
}

/**
 * Polls backend readiness endpoint until 200 OK or timeout.
 */
async function waitForBackendReady(timeoutMs = 12000): Promise<boolean> {
  const healthUrl = `${BACKEND_URL}/health`;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/**
 * Starts the packaged Express backend in production mode.
 */
async function startProductionBackend(): Promise<{
  success: boolean;
  error?: string;
  suggestion?: string;
}> {
  // If running in development or connecting to a hosted backend, skip spawning local process
  if (isDev || IS_HOSTED_BACKEND) {
    if (IS_HOSTED_BACKEND) {
      console.log(`[DevDesk] Operating in Hosted Cloud Backend mode -> ${BACKEND_URL}`);
    }
    return { success: true };
  }

  // Dynamically resolve target port from configured BACKEND_URL (default: 8300)
  const targetPort = (() => {
    try {
      const u = new URL(BACKEND_URL);
      return parseInt(u.port, 10) || 8300;
    } catch {
      return 8300;
    }
  })();

  // 1. Port conflict check & automatic zombie cleanup
  let portCheck = await checkPortOccupied(targetPort);
  if (portCheck.occupied) {
    if (portCheck.isDevDesk) {
      console.log(`[DevDesk] Found existing healthy DevDesk backend on port ${targetPort}. Attaching...`);
      return { success: true };
    }

    // Port is occupied by something that is NOT responding to DevDesk health check.
    // On macOS, check if it is a stale orphaned node / DevDesk zombie and clear it.
    console.warn(`[DevDesk] Port ${targetPort} is occupied by an unresponsive process. Attempting recovery...`);
    try {
      const pidStr = execSync(`lsof -ti :${targetPort}`, { encoding: "utf8" }).trim();
      if (pidStr) {
        const pids = pidStr
          .split(/\s+/)
          .map((p) => parseInt(p, 10))
          .filter((p) => !isNaN(p) && p > 0 && p !== process.pid);
        for (const p of pids) {
          try {
            process.kill(p, "SIGTERM");
          } catch {}
        }
        await new Promise((r) => setTimeout(r, 600));

        // Re-check
        portCheck = await checkPortOccupied(targetPort);
        if (!portCheck.occupied) {
          console.log(`[DevDesk] Successfully freed port ${targetPort}.`);
        } else if (portCheck.isDevDesk) {
          return { success: true };
        } else {
          // Force kill
          for (const p of pids) {
            try {
              process.kill(p, "SIGKILL");
            } catch {}
          }
          await new Promise((r) => setTimeout(r, 400));
          portCheck = await checkPortOccupied(targetPort);
        }
      }
    } catch {
      // lsof not available or exited with error
    }

    if (portCheck.occupied && !portCheck.isDevDesk) {
      return {
        success: false,
        error: `Port ${targetPort} is in use by another application on your Mac.`,
        suggestion: `Please identify and close the process using port ${targetPort} (e.g., run 'lsof -i :${targetPort}' in terminal), then click Retry Startup.`,
      };
    }
  }

  // 2. Resolve backend entry point
  let backendPath = path.join(process.resourcesPath, "backend/dist/index.js");
  if (!fsSync.existsSync(backendPath)) {
    const fallbackPath = path.resolve(__dirname, "../../backend/dist/index.js");
    if (fsSync.existsSync(fallbackPath)) {
      backendPath = fallbackPath;
    } else {
      return {
        success: false,
        error: `Backend entry point not found at "${backendPath}".`,
        suggestion: "Please reinstall or rebuild DevDesk.",
      };
    }
  }

  console.log("[DevDesk] Launching packaged backend at:", backendPath);

  try {
    const child = spawn(process.execPath, [backendPath], {
      cwd: path.dirname(backendPath),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: String(targetPort),
        HOST: "127.0.0.1",
        NODE_ENV: "production",
        DEVDESK_DATA_DIR: path.join(app.getPath("appData"), "DevDesk"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    backendChild = child;

    let childExitedPrematurely = false;
    let exitMessage = "";

    child.stdout.on("data", (chunk: Buffer) => {
      console.log(`[Backend STDOUT] ${chunk.toString().trim()}`);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const errStr = chunk.toString().trim();
      console.error(`[Backend STDERR] ${errStr}`);
      exitMessage += errStr + " ";
    });

    child.on("exit", (code, signal) => {
      childExitedPrematurely = true;
      console.log(`[DevDesk] Backend process exited with code ${code}, signal ${signal}`);
    });

    // 3. Poll readiness
    const ready = await waitForBackendReady(12000);
    if (!ready) {
      if (childExitedPrematurely) {
        return {
          success: false,
          error: `Backend process exited prematurely (${exitMessage.slice(0, 150) || "Unknown error"}).`,
          suggestion: `Ensure port ${targetPort} is free and system permissions allow execution.`,
        };
      }
      return {
        success: false,
        error: "Backend service did not respond within 12 seconds.",
        suggestion: "Check system activity or restart DevDesk.",
      };
    }

    console.log(`[DevDesk] Backend successfully started on http://127.0.0.1:${targetPort}`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Process spawn failed";
    return {
      success: false,
      error: `Failed to spawn backend process: ${msg}`,
      suggestion: "Verify system permissions and ensure DevDesk has execute rights.",
    };
  }
}

function cleanupBackendProcess(): void {
  if (backendChild) {
    console.log("[DevDesk] Gracefully shutting down backend child process...");
    try {
      const pid = backendChild.pid;
      if (pid) {
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          backendChild.kill("SIGTERM");
        }
      } else {
        backendChild.kill("SIGTERM");
      }
    } catch (err) {
      console.warn("[DevDesk] Failed to send SIGTERM to backend:", err);
    }
    backendChild = null;
  }
}

async function createWindow(): Promise<void> {
  const iconPath = path.join(__dirname, "../build-resources/icon.png");
  const hasIcon = fsSync.existsSync(iconPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "DevDesk",
    backgroundColor: "#09090b",
    icon: hasIcon ? iconPath : undefined,
    fullscreen: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  if (process.platform === "darwin" && app.dock && hasIcon) {
    try {
      app.dock.setIcon(iconPath);
    } catch {}
  }

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) {
      mainWindow.setFullScreen(true);
      mainWindow.show();
    }
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F11") {
      if (mainWindow) {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
      }
      event.preventDefault();
      return;
    }

    if (
      isDev &&
      ((input.meta && input.alt && input.key.toLowerCase() === "i") ||
        (input.control && input.shift && input.key.toLowerCase() === "i") ||
        input.key === "F12")
    ) {
      if (mainWindow) {
        mainWindow.webContents.toggleDevTools();
      }
      event.preventDefault();
    }
  });

  // Intercept all window.open / <a target="_blank"> and open in default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:") || url.startsWith("mailto:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (isDev) {
    // Development mode: Attempt to load the Next.js dev server
    mainWindow.loadURL(FRONTEND_DEV_URL).catch((err) => {
      console.warn(
        `[DevDesk] Could not connect to dev server at ${FRONTEND_DEV_URL}:`,
        err.message
      );
      if (mainWindow) {
        mainWindow.loadURL(getOfflineErrorHtml(FRONTEND_DEV_URL));
      }
    });

    mainWindow.webContents.on(
      "did-fail-load",
      (_event, errorCode, _errorDescription, validatedURL) => {
        if (errorCode === -102 && mainWindow) {
          mainWindow.loadURL(getOfflineErrorHtml(validatedURL));
        }
      }
    );
  } else {
    // Production mode: Start backend and load frontend via app:// protocol
    const backendResult = await startProductionBackend();
    if (!backendResult.success && mainWindow) {
      mainWindow.loadURL(
        getBackendErrorHtml(
          "Backend Initialization Failed",
          backendResult.error || "Could not launch DevDesk local backend service.",
          backendResult.suggestion || "Please check conflicting applications and retry."
        )
      );
      return;
    }

    if (mainWindow) {
      mainWindow.loadURL("app://devdesk/").catch((err) => {
        console.error("[DevDesk] Failed to load app://devdesk/:", err);
      });
    }
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

interface EditorConfig {
  id: string;
  name: string;
  cliCommands: string[];
  macAppNames: string[];
  macBundleIds: string[];
  winCommands?: string[];
}

const SUPPORTED_EDITORS: Record<string, EditorConfig> = {
  vscode: {
    id: "vscode",
    name: "Visual Studio Code",
    cliCommands: ["code"],
    macAppNames: ["Visual Studio Code"],
    macBundleIds: ["com.microsoft.VSCode"],
    winCommands: ["code.cmd"],
  },
  cursor: {
    id: "cursor",
    name: "Cursor",
    cliCommands: ["cursor"],
    macAppNames: ["Cursor"],
    macBundleIds: ["com.todesktop.230313mzl4w4u92"],
    winCommands: ["cursor.cmd"],
  },
  windsurf: {
    id: "windsurf",
    name: "Windsurf",
    cliCommands: ["windsurf"],
    macAppNames: ["Windsurf"],
    macBundleIds: ["com.exafunction.windsurf"],
  },
  intellij: {
    id: "intellij",
    name: "IntelliJ IDEA",
    cliCommands: ["idea"],
    macAppNames: ["IntelliJ IDEA", "IntelliJ IDEA CE", "IntelliJ IDEA Ultimate"],
    macBundleIds: ["com.jetbrains.intellij", "com.jetbrains.intellij.ce"],
  },
  webstorm: {
    id: "webstorm",
    name: "WebStorm",
    cliCommands: ["webstorm"],
    macAppNames: ["WebStorm"],
    macBundleIds: ["com.jetbrains.WebStorm"],
  },
  pycharm: {
    id: "pycharm",
    name: "PyCharm",
    cliCommands: ["pycharm"],
    macAppNames: ["PyCharm", "PyCharm CE"],
    macBundleIds: ["com.jetbrains.pycharm", "com.jetbrains.pycharm.ce"],
  },
  sublime: {
    id: "sublime",
    name: "Sublime Text",
    cliCommands: ["subl"],
    macAppNames: ["Sublime Text"],
    macBundleIds: ["com.sublimetext.4", "com.sublimetext.3"],
  },
  zed: {
    id: "zed",
    name: "Zed",
    cliCommands: ["zed"],
    macAppNames: ["Zed"],
    macBundleIds: ["dev.zed.Zed"],
  },
  xcode: {
    id: "xcode",
    name: "Xcode",
    cliCommands: ["xcode"],
    macAppNames: ["Xcode"],
    macBundleIds: ["com.apple.dt.Xcode"],
  },
  fleet: {
    id: "fleet",
    name: "Fleet",
    cliCommands: ["fleet"],
    macAppNames: ["Fleet"],
    macBundleIds: ["Fleet"],
  },
};

/**
 * Safely launches any chosen editor opening the specified directory.
 */
async function openInEditor(
  projectPath: string,
  editorId: string = "vscode"
): Promise<ActionResult> {
  if (!projectPath || typeof projectPath !== "string") {
    return { success: false, error: "Invalid project path." };
  }

  const resolved = path.resolve(projectPath);

  try {
    const stats = await fs.stat(resolved);
    if (!stats.isDirectory()) {
      return { success: false, error: `Path is not a directory: "${resolved}"` };
    }
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    return { success: false, error: `Directory not found or inaccessible: ${error.message}` };
  }

  const config = SUPPORTED_EDITORS[editorId] || SUPPORTED_EDITORS["vscode"];

  const trySpawn = (command: string, args: string[]): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const child = spawn(command, args, {
          shell: false,
          detached: true,
          stdio: "ignore",
        });

        let settled = false;
        const finish = (result: boolean) => {
          if (!settled) {
            settled = true;
            resolve(result);
          }
        };

        child.on("error", () => {
          finish(false);
        });

        child.on("exit", (code) => {
          if (code !== 0 && code !== null) {
            finish(false);
          } else {
            finish(true);
          }
        });

        child.unref();

        setTimeout(() => {
          finish(true);
        }, 150);
      } catch {
        resolve(false);
      }
    });
  };

  // 1. Try CLI commands
  for (const cmd of config.cliCommands) {
    const success = await trySpawn(cmd, [resolved]);
    if (success) return { success: true };
  }

  // 2. Platform-specific fallbacks
  if (process.platform === "darwin") {
    // Try bundle IDs
    for (const bundleId of config.macBundleIds) {
      const bundleSuccess = await trySpawn("open", ["-b", bundleId, resolved]);
      if (bundleSuccess) return { success: true };
    }

    // Try app names
    for (const appName of config.macAppNames) {
      const appSuccess = await trySpawn("open", ["-a", appName, resolved]);
      if (appSuccess) return { success: true };
    }
  }

  if (process.platform === "win32" && config.winCommands) {
    for (const cmd of config.winCommands) {
      const winSuccess = await trySpawn(cmd, [resolved]);
      if (winSuccess) return { success: true };
    }
  }

  return {
    success: false,
    error: `Could not launch ${config.name}. Please ensure ${config.name} is installed or available in PATH.`,
  };
}

/**
 * Backward compatibility wrapper for VS Code.
 */
async function openInVSCode(projectPath: string): Promise<ActionResult> {
  return openInEditor(projectPath, "vscode");
}

/**
 * Safely reveals the project directory in the OS file manager.
 */
async function revealInFinder(projectPath: string): Promise<ActionResult> {
  if (!projectPath || typeof projectPath !== "string") {
    return { success: false, error: "Invalid project path." };
  }

  const resolved = path.resolve(projectPath);

  try {
    const stats = await fs.stat(resolved);
    if (!stats.isDirectory()) {
      return { success: false, error: `Path is not a directory: "${resolved}"` };
    }
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    return { success: false, error: `Directory not found or inaccessible: ${error.message}` };
  }

  try {
    shell.showItemInFolder(resolved);
    return { success: true };
  } catch (err: unknown) {
    const error = err as Error;
    return { success: false, error: `Failed to reveal in Finder: ${error.message}` };
  }
}

// Basic IPC handlers
function registerIpcHandlers(): void {
  ipcMain.handle("ping", async () => {
    return "pong";
  });

  ipcMain.handle("dialog:select-directory", async (_event, defaultPath?: string) => {
    console.log("[DevDesk] dialog:select-directory handler invoked, defaultPath:", defaultPath);
    const options: Electron.OpenDialogOptions = {
      properties: ["openDirectory"],
    };
    if (defaultPath && typeof defaultPath === "string") {
      options.defaultPath = defaultPath;
    }
    const result = await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle("project:open-vscode", async (_event, projectPath: string) => {
    console.log("[DevDesk] project:open-vscode invoked for:", projectPath);
    return openInVSCode(projectPath);
  });

  ipcMain.handle(
    "project:open-editor",
    async (_event, projectPath: string, editorId?: string) => {
      console.log(
        "[DevDesk] project:open-editor invoked for:",
        projectPath,
        "editor:",
        editorId
      );
      return openInEditor(projectPath, editorId);
    }
  );

  ipcMain.handle("project:reveal-finder", async (_event, projectPath: string) => {
    console.log("[DevDesk] project:reveal-finder invoked for:", projectPath);
    return revealInFinder(projectPath);
  });

  ipcMain.handle("system:open-external", async (_event, url: string) => {
    try {
      if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
        await shell.openExternal(url);
        return { success: true };
      }
      return { success: false, error: "Invalid or unsupported URL" };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  });

  console.log("[DevDesk] IPC handlers registered");
}

// Ensure single application instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log("[DevDesk] Another instance is already running. Quitting duplicate instance.");
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // App lifecycle
  app.whenReady().then(() => {
    const frontendDir = isDev
      ? path.resolve(__dirname, "../../frontend/out")
      : path.join(process.resourcesPath, "frontend");

    protocol.handle("app", (req) => {
      const url = new URL(req.url);
      const decodedPath = decodeURIComponent(url.pathname);
      const filePath = path.join(frontendDir, decodedPath === "/" ? "index.html" : decodedPath);
      return net.fetch(pathToFileURL(filePath).toString());
    });

    registerIpcHandlers();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("before-quit", cleanupBackendProcess);
  app.on("will-quit", cleanupBackendProcess);
  process.on("exit", cleanupBackendProcess);
  process.on("SIGINT", () => {
    cleanupBackendProcess();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanupBackendProcess();
    process.exit(0);
  });

  app.on("window-all-closed", () => {
    cleanupBackendProcess();
    app.quit();
  });
}
