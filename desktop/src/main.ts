import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";

let mainWindow: BrowserWindow | null = null;

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

function createWindow(): void {
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

    // Also handle navigation failures gracefully if dev server restarts
    mainWindow.webContents.on(
      "did-fail-load",
      (_event, errorCode, _errorDescription, validatedURL) => {
        // -102 is ERR_CONNECTION_REFUSED
        if (errorCode === -102 && mainWindow) {
          mainWindow.loadURL(getOfflineErrorHtml(validatedURL));
        }
      }
    );

    // DevTools can be toggled via keyboard shortcut (Cmd+Option+I or F12) rather than popping a second window
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
    // Production mode: Load production static build
    const prodPath = path.join(__dirname, "../../frontend/out/index.html");
    mainWindow.loadFile(prodPath).catch((err) => {
      console.error("[DevDesk] Failed to load production build:", err);
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Basic IPC handlers
function registerIpcHandlers(): void {
  ipcMain.handle("ping", async () => {
    return "pong";
  });
}

// App lifecycle
app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // On macOS, apps typically stay open until explicitly closed with Cmd+Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});
