import { spawn } from "child_process";
import { SystemPortInfo } from "../../types/process.js";
import { processManager } from "./processManager.js";

function runCommand(
  executable: string,
  args: string[],
  timeoutMs: number = 3000
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(executable, args, {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf-8");
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf-8");
      });

      const timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        resolve({ stdout, stderr, code: -1 });
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ stdout, stderr: err.message, code: -1 });
      });
    } catch (err: unknown) {
      const error = err as Error;
      resolve({ stdout: "", stderr: error.message, code: -1 });
    }
  });
}

export class SystemPortService {
  /**
   * Discovers all system-wide TCP listening ports across localhost and network interfaces.
   * Resolves PID, process name, command line, working directory, and cross-references DevDesk managed processes.
   */
  public async getSystemListeningPorts(): Promise<SystemPortInfo[]> {
    if (process.platform !== "darwin" && process.platform !== "linux") {
      return [];
    }

    try {
      // 1. Query all TCP sockets in LISTEN state
      const lsofResult = await runCommand("lsof", [
        "-nP",
        "-iTCP",
        "-sTCP:LISTEN",
      ]);

      if (lsofResult.code !== 0 || !lsofResult.stdout.trim()) {
        return [];
      }

      const lines = lsofResult.stdout.trim().split("\n").slice(1);
      const portMap = new Map<number, SystemPortInfo>();
      const uniquePids = new Set<number>();

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 9) {
          const processName = parts[0];
          const pid = parseInt(parts[1], 10);
          const user = parts[2];
          const protocol = parts[4] || "TCP";
          const nodeName = parts[8];

          // Match node address format, e.g. *:3000, 127.0.0.1:5001, [::]:8080, etc.
          const match = nodeName.match(/^(?:(.*):)?(\d+)$/);
          if (match && !isNaN(pid)) {
            const address = match[1] || "*";
            const port = parseInt(match[2], 10);

            if (!isNaN(port)) {
              uniquePids.add(pid);
              // Avoid duplicate rows for the same port and PID (e.g., listening on IPv4 and IPv6)
              if (!portMap.has(port)) {
                portMap.set(port, {
                  port,
                  pid,
                  processName,
                  user,
                  protocol,
                  address,
                });
              }
            }
          }
        }
      }

      const pidsArray = Array.from(uniquePids);
      if (pidsArray.length === 0) {
        return [];
      }

      // 2. Resolve command lines using ps -A -o pid,command
      const psResult = await runCommand("ps", ["-A", "-o", "pid,command"]);
      const commandMap = new Map<number, string>();
      if (psResult.stdout) {
        for (const psLine of psResult.stdout.split("\n")) {
          const m = psLine.trim().match(/^(\d+)\s+(.*)$/);
          if (m) {
            commandMap.set(parseInt(m[1], 10), m[2]);
          }
        }
      }

      // 3. Resolve working directories using lsof -a -p <pids> -d cwd -Fn
      const cwdMap = new Map<number, string>();
      // Query in batches of up to 50 PIDs to avoid arg length limits
      for (let i = 0; i < pidsArray.length; i += 50) {
        const batch = pidsArray.slice(i, i + 50);
        const cwdResult = await runCommand("lsof", [
          "-a",
          "-p",
          batch.join(","),
          "-d",
          "cwd",
          "-Fn",
        ]);

        if (cwdResult.stdout) {
          let currentPid: number | null = null;
          for (const cLine of cwdResult.stdout.split("\n")) {
            if (cLine.startsWith("p")) {
              currentPid = parseInt(cLine.slice(1), 10);
            } else if (cLine.startsWith("n") && currentPid !== null) {
              cwdMap.set(currentPid, cLine.slice(1));
            }
          }
        }
      }

      // 4. Cross-reference DevDesk managed processes
      const managedProcesses = processManager.getAllProcesses();
      const managedPidMap = new Map<number, string>();
      for (const m of managedProcesses) {
        if (m.pid) {
          managedPidMap.set(m.pid, m.id);
        }
      }

      // 5. Build final list
      const results: SystemPortInfo[] = [];
      for (const item of portMap.values()) {
        const fullCmd = commandMap.get(item.pid);
        const cwd = cwdMap.get(item.pid);
        const devDeskProcessId = managedPidMap.get(item.pid);

        results.push({
          ...item,
          command: fullCmd || item.processName,
          cwd: cwd || undefined,
          isDevDeskManaged: Boolean(devDeskProcessId),
          devDeskProcessId: devDeskProcessId || undefined,
        });
      }

      // Sort by port ascending
      return results.sort((a, b) => a.port - b.port);
    } catch {
      return [];
    }
  }

  /**
   * Kills any running system process by PID.
   * Enforces sanity checks to prevent terminating PID 0 or PID 1 or self.
   */
  public async killProcess(
    pid: number,
    force = false
  ): Promise<{ success: boolean; message: string }> {
    if (!pid || typeof pid !== "number" || isNaN(pid) || pid <= 1) {
      throw new Error(`Invalid process ID: ${pid}. System root processes cannot be terminated.`);
    }

    if (pid === process.pid) {
      throw new Error("Cannot terminate the DevDesk backend process from itself.");
    }

    // Check if process exists
    try {
      process.kill(pid, 0);
    } catch {
      return {
        success: true,
        message: `Process PID ${pid} is no longer running.`,
      };
    }

    // If managed by DevDesk, also update DevDesk process manager state
    const managedProcesses = processManager.getAllProcesses();
    const managed = managedProcesses.find((p) => p.pid === pid);
    if (managed) {
      try {
        await processManager.stopProcess(managed.id);
      } catch {
        // Fall back to direct kill below
      }
    }

    // Send SIGTERM (or SIGKILL if force)
    try {
      process.kill(pid, force ? "SIGKILL" : "SIGTERM");
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(`Failed to terminate PID ${pid}: ${error.message}`);
    }

    // Give it a short grace period and verify termination
    await new Promise((r) => setTimeout(r, 250));
    try {
      process.kill(pid, 0);
      // Still alive, escalate to SIGKILL
      process.kill(pid, "SIGKILL");
    } catch {
      // Successfully stopped
    }

    return {
      success: true,
      message: `Process with PID ${pid} terminated successfully.`,
    };
  }
}

export const systemPortService = new SystemPortService();
