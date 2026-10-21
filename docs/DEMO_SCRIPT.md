# DevDesk — 5–7 Minute Product Demonstration Script 🎬⚡

> **Purpose**: A comprehensive, step-by-step presentation script designed for live stakeholder demonstrations, video recordings, or developer evaluation of **DevDesk v1.0.0** on macOS.  
> **Estimated Duration**: 5 to 7 minutes.  
> **Target Audience**: Software engineers, technical leads, and open-source contributors.

---

## Pre-Demo Preparation (1 Minute Setup)

To ensure a seamless, privacy-preserving demonstration with zero risk to personal files or real credentials, create a disposable demo project before starting.

Run the following command in your terminal:

```bash
# 1. Create a disposable demo project in /tmp
mkdir -p /tmp/devdesk-demo-app
cd /tmp/devdesk-demo-app

# 2. Initialize a git repository with sample code
git init -b main
git config user.name "DevDesk Demo"
git config user.email "demo@devdesk.local"

# 3. Create package.json with runnable scripts
cat << 'EOF' > package.json
{
  "name": "devdesk-demo-app",
  "version": "1.0.0",
  "description": "Demo service for DevDesk evaluation",
  "scripts": {
    "start": "node server.js",
    "ping": "node -e 'console.log(\"[Demo] Ping received at\", new Date().toISOString())'",
    "build": "echo \"[Demo] Build completed successfully.\""
  }
}
EOF

# 4. Create a lightweight Node.js HTTP server (listens on port 4005)
cat << 'EOF' > server.js
const http = require('http');
const PORT = 4005;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    message: 'Hello from DevDesk demo service!',
    timestamp: new Date().toISOString()
  }));
});

server.listen(PORT, () => {
  console.log(`[Demo Server] Listening on http://127.0.0.1:${PORT}`);
});
EOF

# 5. Create a sample .env file with comments and masked variables
cat << 'EOF' > .env
# Application Server Config
PORT=4005
NODE_ENV=development

# Simulated Secret Keys (Masked by DevDesk)
API_SECRET_KEY=demo_sec_994820184a77b
DATABASE_URL=postgresql://demo_user:demo_pass@localhost:5432/demo_db
EOF

# 6. Make initial commit
git add .
git commit -m "feat: initial demo service setup"

# 7. Create an uncommitted change for the Git diff demonstration
echo "console.log('[Demo] Feature branch modification');" >> server.js
```

---

## Timed Walkthrough

```mermaid
timeline
    title 5–7 Minute DevDesk Walkthrough
    0:00 - 0:45 : Launch & Automatic Backend Initialization
    0:45 - 1:45 : Workspace Discovery & Native Actions
    1:45 - 3:00 : Terminal Script Execution & Port Monitoring
    3:00 - 4:00 : Git Branch, Staging & Diff Inspection
    4:00 - 4:45 : HTTP API Tester with Request & Response
    4:45 - 5:30 : Safe Environment File Editing & Masking
    5:30 - 6:15 : Database Manager & Read-Only SQL Explorer
    6:15 - 7:00 : Settings, System Diagnostics & Graceful Quit
```

---

### Act 1: Launch & Automatic Backend Startup (0:00 – 0:45)

**Narrative**:  
*"Welcome to DevDesk. When working on software projects, developers typically keep multiple terminal windows, a Git GUI, Postman, a database client, and process monitors open simultaneously. DevDesk brings these tools into a single native command center."*

**Action**:
1. Launch **DevDesk** from Applications or Spotlight.
2. Note that no manual terminal was required to run `next dev` or start an Express server.
3. Observe the window loading cleanly via the secure `app://devdesk/` protocol with dark mode aesthetics.

**Expected Outcome**:
- Window opens at 1200x800 resolution with the custom DevDesk application icon.
- Local Express backend automatically binds to `127.0.0.1:5001`.
- Health probe succeeds and the **Projects** view appears immediately.

---

### Act 2: Workspace Discovery & Native Actions (0:45 – 1:45)

**Narrative**:  
*"DevDesk organizes your work into persistent workspaces. Let's add our workspace to see how it automatically discovers and catalogs projects."*

**Action**:
1. Click the **Select Workspace** button (or press `Cmd+O`).
2. In the native macOS file picker dialog, select `/tmp/devdesk-demo-app`.
3. Point out the discovered project card showing:
   - **Name**: `devdesk-demo-app`
   - **Type**: `Node.js`
   - **Package Manager**: Detected package manager
   - **Path**: `/tmp/devdesk-demo-app`
4. Click **Open in VS Code**:
   - Visual Studio Code opens the project folder without terminal concatenation.
5. Click **Reveal in Finder**:
   - macOS Finder highlights the folder.

**Expected Outcome**:
- Project metadata is discovered and instantly persisted to local SQLite (`~/Library/Application Support/DevDesk/devdesk.db`).

---

### Act 3: Terminal Script Execution & Port Monitoring (1:45 – 3:00)

**Narrative**:  
*"Instead of switching to a terminal to look up package scripts, DevDesk parses package.json and provides direct execution with live log streaming."*

**Action**:
1. Switch to the **Terminal** tab (`Cmd+2`).
2. Select `devdesk-demo-app` from the project dropdown.
3. Observe available package scripts: `start`, `ping`, `build`.
4. Click **Start** next to the `start` script:
   - Status badge turns green: `running (PID: <pid>)`.
   - Live logs display: `[Demo Server] Listening on http://127.0.0.1:4005`.
5. Navigate to the **Processes** tab (`Cmd+3`):
   - Notice the managed process is listed with its actual TCP listening port: `4005 🟢`.
   - DevDesk detected this port dynamically using non-blocking OS inspection (`lsof`).
   - Mention that unrelated system processes are never exposed or touched.

**Expected Outcome**:
- Script starts cleanly, streams stdout/stderr incrementally, and detects TCP port `4005`.

---

### Act 4: Git Integration (3:00 – 4:00)

**Narrative**:  
*"Now let's check our source control status inside the Git tab."*

**Action**:
1. Navigate to the **Git** tab (`Cmd+4`).
2. Observe the current repository state:
   - **Branch**: `main`
   - **Changes**: Modified file `server.js`.
3. Click on `server.js` to inspect the **Diff Viewer**:
   - Shows the green added line: `console.log('[Demo] Feature branch modification');`.
4. Click **Stage**:
   - `server.js` moves to the **Staged Changes** section.
5. Type a commit message: `feat: add logging to demo server`.
6. Click **Commit**:
   - Status refreshes to a clean working tree.
   - Commit history updates with the new commit hash.

**Expected Outcome**:
- Clean Git operations executed safely via OS spawn without raw shell string concatenation.

---

### Act 5: HTTP API Tester (4:00 – 4:45)

**Narrative**:  
*"Because our demo server is currently running on port 4005, let's test it using DevDesk's built-in API Tester—no Postman or Insomnia required."*

**Action**:
1. Switch to the **API Tester** tab (`Cmd+5`).
2. Method: `GET` (default).
3. URL: `http://127.0.0.1:4005`.
4. Click **Send**:
   - Status: `200 OK`.
   - Time: `< 20 ms`.
   - Response Body: Formatted JSON:
     ```json
     {
       "status": "ok",
       "message": "Hello from DevDesk demo service!",
       "timestamp": "..."
     }
     ```
5. Point out the cancellation button, response timing, and header inspection tabs.

**Expected Outcome**:
- HTTP request completes and renders formatted JSON response with status metrics.

---

### Act 6: Environment Variables Editor (4:45 – 5:30)

**Narrative**:  
*"Managing .env files across microservices often leads to accidental syntax errors or leaked secrets. DevDesk provides a dedicated, safe environment variable manager."*

**Action**:
1. Navigate to the **Environment** tab (`Cmd+6`).
2. Select `.env` from the detected files list.
3. Observe:
   - Key-value table showing `PORT=4005` and `NODE_ENV=development`.
   - Sensitive variable `API_SECRET_KEY` is **masked with bullet points** (`••••••••`).
   - Click the eye icon to reveal the value: `demo_sec_994820184a77b`.
4. Edit `PORT` from `4005` to `4010`.
5. Click **Save**:
   - Automatic backup notice: `.env.bak` created on disk.
   - File written atomically without losing comments or whitespace.

**Expected Outcome**:
- Edits persist cleanly, comments are preserved, and an automatic backup is generated.

---

### Act 7: Database Manager (5:30 – 6:15)

**Narrative**:  
*"DevDesk includes a native database manager with a built-in safety guard that enforces read-only query execution."*

**Action**:
1. Navigate to the **Database** tab (`Cmd+7`).
2. Show the connection profile list.
3. Highlight security features:
   - Connection credentials reside in volatile memory—**zero passwords are saved in SQLite**.
4. If a local PostgreSQL or test container is running:
   - Connect and click on a table to view column schemas (primary keys, nullable fields, data types).
   - Execute a safe `SELECT` query:
     ```sql
     SELECT 1 AS status, 'DevDesk Safe Query' AS label;
     ```
   - Demonstrate the read-only guard by attempting a destructive statement:
     ```sql
     DROP TABLE demo_test;
     ```
   - DevDesk immediately blocks the query:
     > *"Destructive SQL command 'DROP' is not permitted in read-only mode."*

**Expected Outcome**:
- Safe queries execute; destructive mutations or multi-statement injections are rejected.

---

### Act 8: Settings, Diagnostics & Graceful Quit (6:15 – 7:00)

**Narrative**:  
*"Finally, let's look at the system diagnostics and verify clean shutdown."*

**Action**:
1. Open the **Diagnostics / Settings** tab (`Cmd+8` or `Cmd+D`).
2. Review the live system status:
   - Node.js & Electron runtime versions.
   - Uptime and memory consumption.
   - Data directory: `~/Library/Application Support/DevDesk`.
   - Active managed process count.
3. Return to the **Terminal** tab and click **Stop** on the running server (or close DevDesk directly).
4. Press `Cmd+Q` to quit DevDesk:
   - Backend child process receives `SIGTERM` and shuts down cleanly.
   - Port 5001 is released immediately.

**Expected Outcome**:
- Zero orphaned processes or port leaks after quitting.

---

## Post-Demo Cleanup (10 Seconds)

To restore your machine to its pristine state after the demonstration:

```bash
# Remove the disposable demo repository
rm -rf /tmp/devdesk-demo-app
```

*(Optional)* If you wish to reset the demo workspace from DevDesk's SQLite database, click **Forget Workspace** on the project card or remove `~/Library/Application Support/DevDesk/devdesk.db`.

---

## Demonstration Safety Checklist

- [x] **No Real Credentials**: All URLs, passwords, and tokens used in the demo are dummy values (`demo_user`, `demo_pass`, `demo_sec_...`).
- [x] **No Real Database Mutations**: SQL demonstrations strictly use read-only queries (`SELECT`).
- [x] **Safe Directory**: All file interactions are confined to `/tmp/devdesk-demo-app`.
- [x] **Clean Teardown**: Closing the app or stopping the script terminates all child processes.
