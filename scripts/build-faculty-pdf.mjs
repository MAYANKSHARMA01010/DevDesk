import { app, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

app.whenReady().then(async () => {
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>DevDesk - Project Report for Faculty Evaluation</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

    @page {
      size: A4;
      margin: 14mm 16mm 14mm 16mm;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1e293b;
      line-height: 1.5;
      font-size: 10pt;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }

    .header-box {
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 14px;
    }

    h1 {
      font-size: 18pt;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 6px 0;
      padding: 0;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 16px;
      font-size: 9.5pt;
      margin-top: 8px;
    }

    .meta-item strong {
      color: #334155;
    }

    .meta-item a {
      color: #2563eb;
      text-decoration: none;
    }

    h2 {
      font-size: 12pt;
      font-weight: 700;
      color: #0f172a;
      margin-top: 14px;
      margin-bottom: 6px;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 3px;
    }

    h3 {
      font-size: 10.5pt;
      font-weight: 600;
      color: #1d4ed8;
      margin-top: 8px;
      margin-bottom: 3px;
    }

    p {
      margin: 0 0 6px 0;
    }

    ul {
      margin: 0 0 8px 0;
      padding-left: 18px;
    }

    li {
      margin-bottom: 3px;
    }

    strong {
      color: #0f172a;
    }

    .feature-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-left: 3.5px solid #2563eb;
      padding: 6px 10px;
      margin-bottom: 8px;
      border-radius: 0 4px 4px 0;
      page-break-inside: avoid;
    }

    .feature-title {
      font-weight: 600;
      font-size: 10.5pt;
      color: #1e40af;
      margin-bottom: 2px;
    }

    .feature-body {
      font-size: 9.5pt;
      color: #334155;
    }

    .tag {
      display: inline-block;
      padding: 1px 6px;
      background: #e0f2fe;
      color: #0369a1;
      border-radius: 4px;
      font-size: 8.5pt;
      font-weight: 600;
      margin-right: 4px;
    }

    code {
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 8.5pt;
      background: #f1f5f9;
      color: #0f172a;
      padding: 1px 4px;
      border-radius: 3px;
      border: 1px solid #e2e8f0;
    }

    pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 8px 10px;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 8pt;
      line-height: 1.35;
      margin: 8px 0;
      page-break-inside: avoid;
    }

    .callout {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 9.5pt;
      color: #1e40af;
      margin: 8px 0;
    }
  </style>
</head>
<body>

  <div class="header-box">
    <h1>DevDesk — Project Report for Faculty Evaluation 🖥️</h1>
    <div class="meta-grid">
      <div class="meta-item"><strong>Student Name:</strong> Mayank Sharma</div>
      <div class="meta-item"><strong>Project Name:</strong> DevDesk (Developer Command Center)</div>
      <div class="meta-item"><strong>Platform:</strong> macOS Desktop App (Apple Silicon & Intel)</div>
      <div class="meta-item"><strong>Tech Stack:</strong> Electron + Next.js 16 + React 19 + Node.js/Express + SQLite</div>
      <div class="meta-item" style="grid-column: span 2;">
        <strong>GitHub Repository:</strong> <a href="https://github.com/MAYANKSHARMA01010/DevDesk">https://github.com/MAYANKSHARMA01010/DevDesk</a>
      </div>
      <div class="meta-item" style="grid-column: span 2;">
        <strong>Mac DMG Download Link:</strong> <a href="https://drive.google.com/drive/folders/1raRV1BxgL3lI7Tz-kflxTMlECMHlPDvK?usp=sharing">https://drive.google.com/drive/folders/1raRV1BxgL3lI7Tz-kflxTMlECMHlPDvK?usp=sharing</a>
      </div>
    </div>
  </div>

  <h2>1. What is DevDesk? (Simple Overview)</h2>
  <p>
    DevDesk is a desktop application built for software developers so they don't have to keep 5 to 6 heavy applications open at the same time.
  </p>
  <p>
    Normally, when working on a project, a developer has to open:
  </p>
  <ul>
    <li><strong>VS Code</strong> (for writing code)</li>
    <li><strong>Terminal / iTerm</strong> (for running <code>npm run dev</code>, <code>build</code>, etc.)</li>
    <li><strong>Postman</strong> (for testing APIs)</li>
    <li><strong>Git GUI / GitHub Desktop</strong> (for checking branches, commits, and diffs)</li>
    <li><strong>DBeaver or pgAdmin</strong> (for inspecting database tables)</li>
    <li><strong>Activity Monitor / Terminal</strong> (for finding and killing ports like 3000 or 5000 that get stuck)</li>
  </ul>
  <div class="callout">
    <strong>Core Idea:</strong> DevDesk brings all these daily tools together into <strong>one single desktop window</strong>. It runs completely on the user's laptop (100% offline, local-first) with zero cloud dependency and zero tracking.
  </div>

  <h2>2. Why I Built This? (Problem Statement)</h2>
  <ul>
    <li><strong>Laptop Lag & High RAM Usage:</strong> Running VS Code + Postman + DBeaver + Terminal + Chrome eats 4 GB to 6 GB of RAM easily, making laptops heat up and slow down. DevDesk runs as a single lightweight client consuming around 350 MB.</li>
    <li><strong>Too Much Tab Switching:</strong> Developers lose focus constantly switching between 6 different windows just to run a script, test an endpoint, or check a git diff.</li>
    <li><strong>Stuck Ports & Zombie Servers:</strong> Often servers crash in the background and hold port 3000 or 5000. DevDesk automatically detects which ports are occupied and lets you stop them in one click.</li>
    <li><strong>Data Privacy:</strong> Online API testers or cloud tools often sync private keys or queries to external servers. DevDesk keeps everything strictly on the local machine (<code>127.0.0.1</code>).</li>
  </ul>

  <h2>3. Tech Stack Used</h2>
  <ul>
    <li><strong>Desktop Shell:</strong> <span class="tag">Electron</span> Mac desktop app wrapper with native OS integration.</li>
    <li><strong>Frontend UI:</strong> <span class="tag">Next.js 16</span> <span class="tag">React 19</span> <span class="tag">Tailwind CSS</span> (Midnight Slate dark theme).</li>
    <li><strong>Backend:</strong> <span class="tag">Node.js</span> <span class="tag">Express</span> (runs locally on port <code>5001</code> or fallback port).</li>
    <li><strong>Local Storage:</strong> <span class="tag">SQLite</span> (stores saved workspaces and project history locally in <code>~/Library/Application Support/DevDesk/devdesk.db</code>).</li>
    <li><strong>Package Manager:</strong> <span class="tag">pnpm</span> Monorepo workspace configuration.</li>
  </ul>

  <h2>4. Key Features & How They Work (Point-by-Point)</h2>

  <div class="feature-card">
    <div class="feature-title">1. Workspace & Project Scanner</div>
    <div class="feature-body">
      <strong>What it does:</strong> You select any folder on your Mac (like <code>Projects</code> or <code>Downloads</code>), and DevDesk scans all projects inside it automatically.<br/>
      <strong>How it works:</strong> Uses a recursive directory scanner (up to 4 folders deep), finds <code>package.json</code> files, identifies project types (React, Next.js, Express, Python, etc.), and lets you open any project directly in VS Code or Finder with 1 click.
    </div>
  </div>

  <div class="feature-card">
    <div class="feature-title">2. Script Runner & Live Terminal</div>
    <div class="feature-body">
      <strong>What it does:</strong> Reads your project scripts (like <code>dev</code>, <code>build</code>, <code>start</code>, <code>test</code>) and shows them in a clean horizontal bar. You click <strong>Start</strong>, and it runs the script with live colorized logs right inside the app.<br/>
      <strong>How it works:</strong> Spawns background child processes using Node <code>child_process.spawn</code>. Keeps the last 1,000 log lines in a circular memory buffer so the app doesn't slow down, and lets you restart or stop the server cleanly.
    </div>
  </div>

  <div class="feature-card">
    <div class="feature-title">3. Port & Process Manager (with In-App Browser)</div>
    <div class="feature-body">
      <strong>What it does:</strong> Automatically checks which ports (like <code>:3000</code>, <code>:5000</code>) are active. You can open the server in your default browser, or view it directly inside an in-app interactive web preview.<br/>
      <strong>How it works:</strong> Runs the system <code>lsof</code> command in the background to detect open TCP ports without freezing the UI. Only tracks processes started by DevDesk so system processes are not disturbed. The in-app preview has Desktop, Tablet, and Mobile viewport options.
    </div>
  </div>

  <div class="feature-card">
    <div class="feature-title">4. Git Control & Push</div>
    <div class="feature-body">
      <strong>What it does:</strong> Shows your current Git branch, changed files, line-by-line diffs (green for added lines, red for removed lines), lets you stage files, make commits, and push/pull from GitHub.<br/>
      <strong>How it works:</strong> Runs local <code>git</code> commands (<code>status</code>, <code>diff</code>, <code>add</code>, <code>commit</code>, <code>push</code>) targeting the exact repository root. Also includes a <strong>"Stage All & Commit"</strong> and <strong>"Commit & Push 🚀"</strong> button so commits don't get blocked when 0 files are staged.
    </div>
  </div>

  <div class="feature-card">
    <div class="feature-title">5. API Tester (Postman Alternative)</div>
    <div class="feature-body">
      <strong>What it does:</strong> Lets you test REST APIs directly inside DevDesk. Supports <code>GET</code>, <code>POST</code>, <code>PUT</code>, <code>DELETE</code>, <code>PATCH</code> with query parameters, custom headers, and JSON body.<br/>
      <strong>How it works:</strong> Sends HTTP requests using Node.js backend (avoiding browser CORS issues), formats the JSON response, shows status code (<code>200 OK</code>, <code>404</code>, etc.), response size, and time taken in milliseconds.
    </div>
  </div>

  <div class="feature-card">
    <div class="feature-title">6. Environment (.env) Variables Editor</div>
    <div class="feature-body">
      <strong>What it does:</strong> Opens and edits <code>.env</code>, <code>.env.local</code>, <code>.env.production</code> files safely with password/token masking (eye icon toggle) so secrets aren't exposed on screen.<br/>
      <strong>How it works:</strong> Custom parser that keeps all comments and empty spacing intact. Before saving, it automatically creates a <code>.bak</code> backup file and writes atomically to prevent file corruption.
    </div>
  </div>

  <div class="feature-card">
    <div class="feature-title">7. Database Viewer (PostgreSQL & MySQL)</div>
    <div class="feature-body">
      <strong>What it does:</strong> Connects to your local PostgreSQL or MySQL database, shows tables, column schemas (primary keys, types), and lets you run queries to inspect data.<br/>
      <strong>How it works:</strong> Connects via <code>pg</code> and <code>mysql2</code> drivers. <strong>Safety feature:</strong> Uses an SQL AST parser that only allows safe read-only queries (<code>SELECT</code>, <code>SHOW</code>). It automatically blocks accidental destructive queries like <code>DROP TABLE</code> or <code>DELETE</code>. Passwords are kept only in RAM for the active connection and are never saved to disk.
    </div>
  </div>

  <h2>5. System Architecture (How it Works Internally)</h2>
  <pre>
┌──────────────────────────────────────────────────────────────┐
│                    DevDesk Desktop App (macOS)               │
│                                                              │
│   [ Electron Main Process ]                                  │
│   - Native Folder Picker (dialog)                            │
│   - Window controls & app:// protocol                        │
│   - Auto-launches Express backend                            │
│                                                              │
│   [ Frontend: Next.js 16 + React 19 ]                        │
│   - Clean Midnight Slate dark theme                          │
│   - Tabs: Projects, Terminal, Services, Git, API, Env, DB    │
│   - In-app responsive web preview (Desktop / Tablet / Mobile)│
│                                                              │
│   [ Backend: Node.js + Express (127.0.0.1:5001) ]           │
│   - Runs local Git commands & process runner                 │
│   - Checks listening ports using lsof                        │
│   - Safe read-only SQL parser                                │
│   - Stores workspaces in SQLite database                     │
└──────────────────────────────────────────────────────────────┘
  </pre>

  <h2>6. Project Deliverables & Links</h2>
  <ul>
    <li><strong>Mac Application Installer (DMG):</strong> Self-contained <code>.dmg</code> installer for Apple Silicon Macs (~140 MB). Bundles all 129 production dependencies inside <code>Contents/Resources/backend</code> so it works out of the box without installing Node or running terminal commands.</li>
    <li><strong>Google Drive DMG Download Link:</strong> <a href="https://drive.google.com/drive/folders/1raRV1BxgL3lI7Tz-kflxTMlECMHlPDvK?usp=sharing">https://drive.google.com/drive/folders/1raRV1BxgL3lI7Tz-kflxTMlECMHlPDvK?usp=sharing</a></li>
    <li><strong>GitHub Repository:</strong> <a href="https://github.com/MAYANKSHARMA01010/DevDesk">https://github.com/MAYANKSHARMA01010/DevDesk</a></li>
  </ul>

</body>
</html>`;

  const htmlPath = path.join(rootDir, "docs/DevDesk_Faculty_Project_Report.html");
  fs.writeFileSync(htmlPath, htmlContent);

  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 1600,
    webPreferences: {
      nodeIntegration: false
    }
  });

  await win.loadURL(`file://${htmlPath}`);
  await new Promise(r => setTimeout(r, 800));

  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: "A4",
    margins: {
      top: 0.35,
      bottom: 0.35,
      left: 0.4,
      right: 0.4
    }
  });

  const pdfPath = path.join(rootDir, "docs/DevDesk_Faculty_Project_Report.pdf");
  fs.writeFileSync(pdfPath, pdfBuffer);
  console.log(`[SUCCESS] PDF generated at: ${pdfPath} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);
  console.log(`[SUCCESS] HTML generated at: ${htmlPath}`);

  app.quit();
});
