import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from "electron";
import * as path from "path";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as http from "http";
import { spawn, ChildProcess } from "child_process";
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

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const FRONTEND_DEV_URL =
  process.env.ELECTRON_START_URL || "http://localhost:3000";

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
function checkPortOccupied(port: number): Promise<{ occupied: boolean; isDevDesk: boolean }> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/diagnostics`, { timeout: 1000 }, (res) => {
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
            resolve({ occupied: true, isDevDesk: true });
            return;
          }
        } catch {
          // not valid json
        }
        resolve({ occupied: true, isDevDesk: false });
      });
    });

    req.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNREFUSED") {
        resolve({ occupied: false, isDevDesk: false });
      } else {
        resolve({ occupied: true, isDevDesk: false });
      }
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ occupied: true, isDevDesk: false });
    });
  });
}

/**
 * Polls backend readiness endpoint until 200 OK or timeout.
 */
function waitForBackendReady(timeoutMs = 12000): Promise<boolean> {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        resolve(false);
        return;
      }
      const req = http.get("http://127.0.0.1:5001/health", { timeout: 800 }, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve(true);
        }
      });
      req.on("error", () => {});
      req.on("timeout", () => {
        req.destroy();
      });
    }, 250);
  });
}

/**
 * Starts the packaged Express backend in production mode.
 */
async function startProductionBackend(): Promise<{
  success: boolean;
  error?: string;
  suggestion?: string;
}> {
  if (isDev) {
    return { success: true };
  }

  // 1. Port conflict check
  const portCheck = await checkPortOccupied(5001);
  if (portCheck.occupied) {
    if (portCheck.isDevDesk) {
      console.log("[DevDesk] Found existing healthy DevDesk backend on port 5001. Attaching...");
      return { success: true };
    }
    return {
      success: false,
      error: "Port 5001 is already in use by another application on your Mac.",
      suggestion:
        "Please identify and close the process using port 5001 (e.g., run 'lsof -i :5001' in terminal), then click Retry Startup.",
    };
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
        PORT: "5001",
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
          suggestion: "Ensure port 5001 is free and system permissions allow execution.",
        };
      }
      return {
        success: false,
        error: "Backend service did not respond within 12 seconds.",
        suggestion: "Check system activity or restart DevDesk.",
      };
    }

    console.log("[DevDesk] Backend successfully started on http://127.0.0.1:5001");
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
  if (backendChild && !backendChild.killed) {
    console.log("[DevDesk] Gracefully shutting down backend child process...");
    try {
      backendChild.kill("SIGTERM");
    } catch (err) {
      console.warn("[DevDesk] Failed to send SIGTERM to backend:", err);
    }
    backendChild = null;
  }
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "DevDesk",
    backgroundColor: "#09090b",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) {
      mainWindow.show();
    }
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

    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (
        (input.meta && input.alt && input.key.toLowerCase() === "i") ||
        (input.control && input.shift && input.key.toLowerCase() === "i") ||
        input.key === "F12"
      ) {
        if (mainWindow) {
          mainWindow.webContents.toggleDevTools();
        }
        event.preventDefault();
      }
    });
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

/**
 * Safely launches Visual Studio Code opening the specified directory.
 */
async function openInVSCode(projectPath: string): Promise<ActionResult> {
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

  const codeSuccess = await trySpawn("code", [resolved]);
  if (codeSuccess) {
    return { success: true };
  }

  if (process.platform === "darwin") {
    const bundleSuccess = await trySpawn("open", ["-b", "com.microsoft.VSCode", resolved]);
    if (bundleSuccess) {
      return { success: true };
    }

    const appSuccess = await trySpawn("open", ["-a", "Visual Studio Code", resolved]);
    if (appSuccess) {
      return { success: true };
    }
  }

  if (process.platform === "win32") {
    const winSuccess = await trySpawn("code.cmd", [resolved]);
    if (winSuccess) {
      return { success: true };
    }
  }

  return {
    success: false,
    error: "VS Code command ('code') was not found. Please install VS Code or enable the 'code' command in your PATH.",
  };
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

  ipcMain.handle("dialog:select-directory", async () => {
    console.log("[DevDesk] dialog:select-directory handler invoked");
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle("project:open-vscode", async (_event, projectPath: string) => {
    console.log("[DevDesk] project:open-vscode invoked for:", projectPath);
    return openInVSCode(projectPath);
  });

  ipcMain.handle("project:reveal-finder", async (_event, projectPath: string) => {
    console.log("[DevDesk] project:reveal-finder invoked for:", projectPath);
    return revealInFinder(projectPath);
  });

  console.log("[DevDesk] IPC handlers registered");
}

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
  if (process.platform !== "darwin") {
    app.quit();
  }
});
