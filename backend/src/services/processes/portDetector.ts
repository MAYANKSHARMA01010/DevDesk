import { spawn } from "child_process";
import { ManagedProcess, PortDetectionStatus, ProcessPortInfo } from "../../types/process.js";

/**
 * Executes a system binary with strict argument separation and a timeout.
 * Never uses shell: true.
 */
function runCommand(
  executable: string,
  args: string[],
  timeoutMs: number = 2500
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

/**
 * Builds a mapping of parent PID to child PIDs using system ps.
 */
async function getProcessTreePpidMap(): Promise<Map<number, number[]> | null> {
  const result = await runCommand("ps", ["-A", "-o", "pid,ppid"]);
  if (result.code !== 0) {
    return null;
  }

  const ppidMap = new Map<number, number[]>();
  const lines = result.stdout.split("\n");

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) {
      const pid = parseInt(parts[0], 10);
      const ppid = parseInt(parts[1], 10);
      if (!isNaN(pid) && !isNaN(ppid)) {
        if (!ppidMap.has(ppid)) {
          ppidMap.set(ppid, []);
        }
        ppidMap.get(ppid)!.push(pid);
      }
    }
  }

  return ppidMap;
}

/**
 * Finds all descendant PIDs for a given root PID.
 */
function getDescendantPids(rootPid: number, ppidMap: Map<number, number[]>): number[] {
  const family: number[] = [rootPid];
  const queue: number[] = [rootPid];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = ppidMap.get(current) || [];
    for (const child of children) {
      family.push(child);
      queue.push(child);
    }
  }

  return family;
}

/**
 * Discovers TCP listening ports for DevDesk-managed processes on macOS and Linux.
 * Follows process hierarchies from package-manager wrapper processes down to listening sockets.
 * Uses lsof with fixed arguments and shell: false.
 */
export async function detectPortsForProcesses(
  processes: ManagedProcess[]
): Promise<Map<string, ProcessPortInfo>> {
  const results = new Map<string, ProcessPortInfo>();

  // 1. Separate running vs completed processes
  const activeProcesses: ManagedProcess[] = [];

  for (const proc of processes) {
    if (
      proc.status === "stopped" ||
      proc.status === "exited" ||
      proc.status === "failed"
    ) {
      results.set(proc.id, {
        processId: proc.id,
        pid: proc.pid,
        ports: [],
        portStatus: "not_applicable",
      });
    } else if (!proc.pid) {
      results.set(proc.id, {
        processId: proc.id,
        ports: [],
        portStatus: "none",
      });
    } else {
      activeProcesses.push(proc);
    }
  }

  if (activeProcesses.length === 0) {
    return results;
  }

  // 2. Only macOS and Linux support ps and lsof inspection
  if (process.platform !== "darwin" && process.platform !== "linux") {
    for (const proc of activeProcesses) {
      results.set(proc.id, {
        processId: proc.id,
        pid: proc.pid,
        ports: [],
        portStatus: "failed",
      });
    }
    return results;
  }

  try {
    // 3. Build process tree to trace child processes spawned by package managers (e.g. pnpm -> node)
    const ppidMap = await getProcessTreePpidMap();
    if (!ppidMap) {
      for (const proc of activeProcesses) {
        results.set(proc.id, {
          processId: proc.id,
          pid: proc.pid,
          ports: [],
          portStatus: "failed",
        });
      }
      return results;
    }

    // Map each descendant PID to its DevDesk process ID
    const pidToProcessId = new Map<number, string>();
    const allPidsToCheck: number[] = [];

    for (const proc of activeProcesses) {
      if (proc.pid) {
        const family = getDescendantPids(proc.pid, ppidMap);
        for (const p of family) {
          allPidsToCheck.push(p);
          pidToProcessId.set(p, proc.id);
        }
      }
    }

    if (allPidsToCheck.length === 0) {
      for (const proc of activeProcesses) {
        results.set(proc.id, {
          processId: proc.id,
          pid: proc.pid,
          ports: [],
          portStatus: "none",
        });
      }
      return results;
    }

    // 4. Query listening ports strictly for the active managed PIDs
    // -a: AND selection
    // -nP: numeric IP and port (no DNS/service lookup for speed)
    // -iTCP -sTCP:LISTEN: TCP sockets in LISTEN state
    // -p: only the target PIDs (never inspects unrelated system processes)
    const pidArg = allPidsToCheck.join(",");
    const lsofResult = await runCommand("lsof", [
      "-a",
      "-nP",
      "-iTCP",
      "-sTCP:LISTEN",
      "-p",
      pidArg,
    ]);

    // Initialize all active processes as "none"
    const discoveredPortsByProcess = new Map<string, Set<number>>();
    for (const proc of activeProcesses) {
      discoveredPortsByProcess.set(proc.id, new Set<number>());
    }

    // Parse lsof output
    // Sample line: node 40861 user 16u IPv6 0x... 0t0 TCP *:3000 (LISTEN)
    if (lsofResult.stdout.trim().length > 0) {
      const lines = lsofResult.stdout.split("\n");
      for (const line of lines) {
        // Match PID in second column, and port at the end of the address before (LISTEN)
        const match = line.match(/\s+(\d+)\s+.*TCP\s+(?:.*:)(\d+)\s+\(LISTEN\)/);
        if (match) {
          const matchedPid = parseInt(match[1], 10);
          const port = parseInt(match[2], 10);

          if (!isNaN(matchedPid) && !isNaN(port)) {
            const processId = pidToProcessId.get(matchedPid);
            if (processId && discoveredPortsByProcess.has(processId)) {
              discoveredPortsByProcess.get(processId)!.add(port);
            }
          }
        }
      }
    }

    // Populate results
    for (const proc of activeProcesses) {
      const portSet = discoveredPortsByProcess.get(proc.id) || new Set<number>();
      const ports = Array.from(portSet).sort((a, b) => a - b);
      const portStatus: PortDetectionStatus = ports.length > 0 ? "detected" : "none";

      results.set(proc.id, {
        processId: proc.id,
        pid: proc.pid,
        ports,
        portStatus,
      });
    }

    return results;
  } catch {
    for (const proc of activeProcesses) {
      results.set(proc.id, {
        processId: proc.id,
        pid: proc.pid,
        ports: [],
        portStatus: "failed",
      });
    }
    return results;
  }
}
