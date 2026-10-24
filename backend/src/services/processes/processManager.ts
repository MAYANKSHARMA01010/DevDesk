import { ChildProcess, spawn } from "child_process";
import crypto from "crypto";
import * as path from "path";
import * as fs from "fs/promises";
import {
  ManagedProcess,
  ProcessLogEntry,
  ProcessLogsResult,
  ProcessStatus,
} from "../../types/process.js";
import { workspaceRepository } from "../workspaces/workspaceRepository.js";
import { discoverProjectScripts } from "../projects/scriptDiscovery.js";

const MAX_LOG_LINES = 2500;
const STOP_TIMEOUT_MS = 5000;

interface ManagedProcessInternal {
  process: ManagedProcess;
  child: ChildProcess | null;
  logs: ProcessLogEntry[];
  sequenceId: number;
  stdoutBuffer: string;
  stderrBuffer: string;
  stopTimer?: NodeJS.Timeout;
}

export class ProcessManager {
  private processes = new Map<string, ManagedProcessInternal>();

  /**
   * Builds an augmented PATH environment variable on macOS/Linux
   * so package managers like pnpm, yarn, and npm are discovered reliably.
   */
  private getEnvironment(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: "1" };
    // Do not leak DevDesk's internal daemon port to child processes
    delete env.PORT;

    if (process.platform === "darwin" || process.platform === "linux") {
      const standardPaths = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
      ];
      const existing = env.PATH ? env.PATH.split(":") : [];
      const combined = Array.from(new Set([...existing, ...standardPaths]));
      env.PATH = combined.join(":");
    }
    return env;
  }

  /**
   * Adds a log line to a managed process's bounded buffer.
   */
  private appendLog(
    internal: ManagedProcessInternal,
    stream: "stdout" | "stderr" | "system",
    message: string
  ): void {
    internal.sequenceId += 1;
    const entry: ProcessLogEntry = {
      id: internal.sequenceId,
      timestamp: new Date().toISOString(),
      stream,
      message,
    };

    internal.logs.push(entry);

    if (internal.logs.length > MAX_LOG_LINES) {
      // Bounded buffer: remove oldest entries
      internal.logs.splice(0, internal.logs.length - MAX_LOG_LINES);
    }
  }

  /**
   * Flushes partial line buffers if any text remains.
   */
  private flushLineBuffer(
    internal: ManagedProcessInternal,
    stream: "stdout" | "stderr"
  ): void {
    const buf = stream === "stdout" ? internal.stdoutBuffer : internal.stderrBuffer;
    if (buf.length > 0) {
      this.appendLog(internal, stream, buf);
      if (stream === "stdout") {
        internal.stdoutBuffer = "";
      } else {
        internal.stderrBuffer = "";
      }
    }
  }

  /**
   * Handles incoming text chunks from child process streams,
   * splitting them into clean lines for the bounded log buffer.
   */
  private handleStreamData(
    internal: ManagedProcessInternal,
    stream: "stdout" | "stderr",
    data: Buffer | string
  ): void {
    const text = data.toString("utf-8");
    const currentBuf = stream === "stdout" ? internal.stdoutBuffer : internal.stderrBuffer;
    const combined = currentBuf + text;
    const lines = combined.split(/\r?\n/);

    // The last element is a partial line (or empty string if ends with newline)
    const remainder = lines.pop() ?? "";

    if (stream === "stdout") {
      internal.stdoutBuffer = remainder;
    } else {
      internal.stderrBuffer = remainder;
    }

    for (const line of lines) {
      if (line.length > 0 || text.includes("\n")) {
        this.appendLog(internal, stream, line);
        this.extractPortsFromLog(internal, line);
      }
    }
  }

  /**
   * Automatically extracts listening ports and localhost URLs from process output.
   */
  private extractPortsFromLog(internal: ManagedProcessInternal, line: string): void {
    const portMatches = line.matchAll(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|port)[:\s/]+(\d{2,5})/gi);
    const existing = new Set(internal.process.ports || []);
    for (const match of portMatches) {
      const portNum = parseInt(match[1], 10);
      if (portNum >= 80 && portNum <= 65535) {
        existing.add(portNum);
      }
    }
    if (existing.size > (internal.process.ports?.length || 0)) {
      internal.process.ports = Array.from(existing).sort((a, b) => a - b);
    }
  }

  /**
   * Starts a package.json script for a saved project.
   */
  public  async startProcess(
    projectId: string,
    scriptName: string,
    customCommand?: string
  ): Promise<ManagedProcess> {
    if (!projectId || typeof projectId !== "string" || projectId.trim().length === 0) {
      throw new Error("Project ID is required and must be a valid string");
    }
    if (
      (!scriptName || typeof scriptName !== "string" || scriptName.trim().length === 0) &&
      (!customCommand || typeof customCommand !== "string" || customCommand.trim().length === 0)
    ) {
      throw new Error("Script name or custom command is required and must be a valid string");
    }

    const cleanProjectId = projectId.trim();
    const cleanScriptName = (scriptName || "").trim();
    const cleanCustomCommand = (customCommand || "").trim();

    // 1. Resolve project from SQLite database
    const project = workspaceRepository.getProjectById(cleanProjectId);
    if (!project) {
      throw new Error(`Project not found in database with ID "${cleanProjectId}"`);
    }

    // 2. Discover and validate script
    const { scripts } = await discoverProjectScripts(cleanProjectId);
    const scriptDef = scripts[cleanScriptName];

    if (!cleanCustomCommand && !scriptDef) {
      throw new Error(
        `Script "${cleanScriptName}" was not found in package.json for project "${project.name}". Available scripts: ${Object.keys(scripts).join(", ") || "(none)"}`
      );
    }

    const scriptLabel = cleanCustomCommand ? (cleanScriptName || cleanCustomCommand.split(" ")[0]) : cleanScriptName;

    // 3. Prevent duplicate launches of the same project and script
    for (const internal of this.processes.values()) {
      if (
        internal.process.projectId === cleanProjectId &&
        internal.process.script === scriptLabel &&
        (internal.process.status === "running" ||
          internal.process.status === "starting" ||
          internal.process.status === "stopping")
      ) {
        throw new Error(
          `Script "${scriptLabel}" is already active for project "${project.name}" (process ID: ${internal.process.id})`
        );
      }
    }

    // 4. Map executable and arguments
    let executable = "npm";
    let spawnArgs: string[] = ["run", cleanScriptName];
    let fullCommand = `${executable} run ${cleanScriptName}`;
    let useShell = true;

    // Check if script is defined in package.json
    let isPackageJsonScript = false;
    try {
      const pkgPath = path.join(project.path, "package.json");
      const pkgRaw = await fs.readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(pkgRaw);
      if (pkg?.scripts && typeof pkg.scripts === "object" && cleanScriptName in pkg.scripts) {
        isPackageJsonScript = true;
      }
    } catch {
      // not a package.json script
    }

    const isNonNpmSpecialRuntime =
      cleanScriptName.startsWith("cargo:") ||
      cleanScriptName.startsWith("go:") ||
      cleanScriptName.startsWith("make:") ||
      cleanScriptName.startsWith("sh:") ||
      cleanScriptName.startsWith("composer:") ||
      cleanScriptName.startsWith("pip:") ||
      cleanScriptName.startsWith("pipenv:") ||
      cleanScriptName.startsWith("poetry:") ||
      cleanScriptName.startsWith("python") ||
      cleanScriptName.startsWith("cargo ") ||
      cleanScriptName.startsWith("go ") ||
      cleanScriptName.startsWith("make ") ||
      cleanScriptName.startsWith("bash ") ||
      cleanScriptName === "runserver" ||
      cleanScriptName === "migrate" ||
      cleanScriptName === "makemigrations" ||
      cleanScriptName === "app.py" ||
      cleanScriptName === "main.py";

    if (cleanCustomCommand) {
      const parts = cleanCustomCommand.split(" ").filter(Boolean);
      executable = parts[0];
      spawnArgs = parts.slice(1);
      fullCommand = cleanCustomCommand;
      useShell = true;
    } else if (!isPackageJsonScript && isNonNpmSpecialRuntime && scriptDef) {
      const parts = scriptDef.split(" ").filter(Boolean);
      executable = parts[0];
      spawnArgs = parts.slice(1);
      fullCommand = scriptDef;
      useShell = true;
    } else {
      const pm = project.packageManager || "npm";
      executable = pm;
      spawnArgs = ["run", cleanScriptName];
      fullCommand = `${pm} run ${cleanScriptName}`;
      useShell = true;
    }

    const processId = crypto.randomUUID();
    const now = new Date().toISOString();

    const managedProcess: ManagedProcess = {
      id: processId,
      projectId: project.id,
      workspaceId: project.workspaceId,
      projectName: project.displayName || project.name,
      script: scriptLabel,
      command: fullCommand,
      status: "starting",
      exitCode: null,
      startedAt: now,
      ports: [],
    };

    const internal: ManagedProcessInternal = {
      process: managedProcess,
      child: null,
      logs: [],
      sequenceId: 0,
      stdoutBuffer: "",
      stderrBuffer: "",
    };

    this.processes.set(processId, internal);

    this.appendLog(
      internal,
      "system",
      `[DevDesk] Launching: ${fullCommand} in ${project.path}`
    );

    // 5. Spawn child process safely
    try {
      const child = spawn(executable, spawnArgs, {
        cwd: project.path,
        shell: useShell,
        env: this.getEnvironment(),
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });

      internal.child = child;
      managedProcess.pid = child.pid;
      managedProcess.status = "running";

      this.appendLog(
        internal,
        "system",
        `[DevDesk] Process started (PID: ${child.pid})`
      );

      // Listen for stdout
      child.stdout.on("data", (chunk: Buffer) => {
        this.handleStreamData(internal, "stdout", chunk);
      });

      // Listen for stderr
      child.stderr.on("data", (chunk: Buffer) => {
        this.handleStreamData(internal, "stderr", chunk);
      });

      // Handle spawn error (e.g., executable not found)
      child.on("error", (err: NodeJS.ErrnoException) => {
        this.flushLineBuffer(internal, "stdout");
        this.flushLineBuffer(internal, "stderr");

        managedProcess.status = "failed";
        managedProcess.stoppedAt = new Date().toISOString();

        let errMsg = err.message;
        if (err.code === "ENOENT") {
          errMsg = `Package manager "${executable}" was not found in system PATH.`;
        }

        this.appendLog(
          internal,
          "system",
          `[DevDesk] Process failed to spawn: ${errMsg}`
        );
      });

      // Handle process exit
      child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
        if (internal.stopTimer) {
          clearTimeout(internal.stopTimer);
          internal.stopTimer = undefined;
        }

        this.flushLineBuffer(internal, "stdout");
        this.flushLineBuffer(internal, "stderr");

        managedProcess.exitCode = code;
        managedProcess.stoppedAt = new Date().toISOString();

        if (managedProcess.status === "stopping") {
          managedProcess.status = "stopped";
          this.appendLog(
            internal,
            "system",
            `[DevDesk] Process stopped by user (signal: ${signal || "SIGTERM"})`
          );
        } else if (code === 0) {
          managedProcess.status = "exited";
          this.appendLog(
            internal,
            "system",
            `[DevDesk] Process finished successfully (exit code 0)`
          );
        } else {
          managedProcess.status = "failed";
          this.appendLog(
            internal,
            "system",
            `[DevDesk] Process exited with error code ${code ?? signal ?? "unknown"}`
          );
        }

        internal.child = null;
      });

      return managedProcess;
    } catch (err: unknown) {
      const error = err as Error;
      managedProcess.status = "failed";
      managedProcess.stoppedAt = new Date().toISOString();
      this.appendLog(
        internal,
        "system",
        `[DevDesk] Unexpected launch error: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Stops an active managed process gracefully.
   */
  public async stopProcess(processId: string): Promise<ManagedProcess> {
    if (!processId || typeof processId !== "string") {
      throw new Error("Process ID is required");
    }

    const internal = this.processes.get(processId);
    if (!internal) {
      throw new Error(`Process with ID "${processId}" not found`);
    }

    const { child, process: managedProcess } = internal;

    // If process already exited or stopped, return current state
    if (
      !child ||
      managedProcess.status === "stopped" ||
      managedProcess.status === "exited" ||
      managedProcess.status === "failed"
    ) {
      return managedProcess;
    }

    managedProcess.status = "stopping";
    this.appendLog(
      internal,
      "system",
      `[DevDesk] Sending SIGTERM to process (PID: ${managedProcess.pid})...`
    );

    // 1. Graceful termination with SIGTERM
    try {
      if (child.pid && process.platform !== "win32") {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          try {
            // Fallback to killing direct children spawned by the shell
            spawn("pkill", ["-TERM", "-P", String(child.pid)]);
          } catch {
            // ignore error if pkill fails
          }
        }
      }
      child.kill("SIGTERM");
    } catch (err: unknown) {
      const error = err as Error;
      this.appendLog(
        internal,
        "system",
        `[DevDesk] SIGTERM signal failed: ${error.message}`
      );
    }

    // 2. Set timeout fallback: SIGKILL after 5 seconds if still running
    internal.stopTimer = setTimeout(() => {
      if (internal.child && managedProcess.status === "stopping") {
        this.appendLog(
          internal,
          "system",
          `[DevDesk] Process did not exit within ${STOP_TIMEOUT_MS / 1000}s. Sending SIGKILL...`
        );
        try {
          if (internal.child.pid && process.platform !== "win32") {
            try {
              process.kill(-internal.child.pid, "SIGKILL");
            } catch {
              try {
                spawn("pkill", ["-9", "-P", String(internal.child.pid)]);
              } catch {
                // ignore
              }
            }
          }
          internal.child.kill("SIGKILL");
        } catch {
          // ignore error if already killed
        }
      }
    }, STOP_TIMEOUT_MS);

    return managedProcess;
  }

  /**
   * Restarts a process using its existing project and script configuration.
   */
  public async restartProcess(processId: string): Promise<ManagedProcess> {
    const internal = this.processes.get(processId);
    if (!internal) {
      throw new Error(`Process with ID "${processId}" not found`);
    }

    const { projectId, script } = internal.process;

    // If currently running, stop it and wait briefly for exit
    if (
      internal.process.status === "running" ||
      internal.process.status === "starting" ||
      internal.process.status === "stopping"
    ) {
      await this.stopProcess(processId);

      // Wait up to 2 seconds for process to exit cleanly before restarting
      const startWait = Date.now();
      while (internal.child && Date.now() - startWait < 2000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Start a fresh process instance with the same configuration
    return this.startProcess(projectId, script);
  }

  /**
   * Retrieves single process details by ID.
   */
  public getProcess(processId: string): ManagedProcess | null {
    const internal = this.processes.get(processId);
    return internal ? internal.process : null;
  }

  /**
   * Returns all managed processes (running and recent).
   */
  public getAllProcesses(): ManagedProcess[] {
    return Array.from(this.processes.values()).map((p) => p.process);
  }

  /**
   * Returns incremental logs for a process whose sequence IDs > afterSequenceId.
   */
  public getProcessLogs(
    processId: string,
    afterSequenceId: number = 0
  ): ProcessLogsResult | null {
    const internal = this.processes.get(processId);
    if (!internal) {
      return null;
    }

    const filteredLogs =
      afterSequenceId <= 0
        ? internal.logs
        : internal.logs.filter((log) => log.id > afterSequenceId);

    return {
      processId: internal.process.id,
      status: internal.process.status,
      exitCode: internal.process.exitCode,
      logs: filteredLogs,
      latestSequenceId: internal.sequenceId,
    };
  }

  /**
   * Gracefully terminates all active child processes when DevDesk backend shuts down.
   */
  public cleanupAll(): void {
    console.log("[DevDesk] Cleaning up managed child processes...");
    for (const [id, internal] of this.processes.entries()) {
      if (internal.child) {
        try {
          internal.child.kill("SIGTERM");
          console.log(`[DevDesk] Sent SIGTERM to process ${id} (PID: ${internal.process.pid})`);
        } catch {
          // ignore
        }
      }
    }
  }
}

export const processManager = new ProcessManager();
