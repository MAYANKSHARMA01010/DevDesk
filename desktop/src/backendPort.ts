import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { promisify } from "node:util";

const run = promisify(execFile);
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function portIsFree(port: number): Promise<boolean> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") resolve(false);
      else reject(error);
    });
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function listeners(port: number): Promise<number[]> {
  try {
    const { stdout } = await run("/usr/sbin/lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { timeout: 2000 });
    return [...new Set(stdout.trim().split(/\s+/).map(Number))].filter((pid) => Number.isInteger(pid) && pid > 1);
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string };
    if (failure.code === 1 && !failure.stdout?.trim()) return [];
    throw error;
  }
}

async function ancestors(): Promise<Set<number>> {
  const protectedPids = new Set([process.pid]);
  let pid = process.ppid;
  while (pid > 1 && !protectedPids.has(pid)) {
    protectedPids.add(pid);
    const { stdout } = await run("/bin/ps", ["-p", String(pid), "-o", "ppid="], { timeout: 2000 });
    pid = Number(stdout.trim());
  }
  return protectedPids;
}

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await portIsFree(port)) return true;
    await pause(100);
  } while (Date.now() < deadline);
  return false;
}

/** Reclaim only the configured backend TCP port, as requested by the app owner. */
export async function freeBackendPort(port: number): Promise<void> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid backend port");
  if (await portIsFree(port)) return;
  const protectedPids = await ancestors();
  for (let attempt = 0; attempt < 3; attempt++) {
    const pids = await listeners(port);
    if (pids.some((pid) => protectedPids.has(pid))) {
      throw new Error(`Port ${port} belongs to DevDesk or its launcher and cannot be reclaimed`);
    }
    if (pids.length === 0) {
      if (await waitForPort(port, 300)) return;
      throw new Error(`Cannot identify the listener on port ${port}`);
    }
    console.log(`[DevDesk] Reclaiming backend port ${port} from PID(s): ${pids.join(", ")}`);
    for (const pid of pids) {
      try { process.kill(pid, "SIGTERM"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    }
    if (await waitForPort(port, 1500)) return;
    // Recheck ownership before escalation: a different process may now own the port.
    const remaining = await listeners(port);
    for (const pid of remaining.filter((pid) => pids.includes(pid))) {
      try { process.kill(pid, "SIGKILL"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    }
    if (await waitForPort(port, 1500)) return;
  }
  throw new Error(`Port ${port} is still occupied after startup recovery`);
}
