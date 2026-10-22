import { Request, Response } from "express";
import { processManager } from "../services/processes/processManager.js";
import { detectPortsForProcesses } from "../services/processes/portDetector.js";
import { systemPortService } from "../services/processes/systemPortService.js";
import { ProcessPortInfo } from "../types/process.js";

/**
 * Handles POST /api/processes/start
 * Body: { projectId: string, script: string }
 */
export async function startProcessController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId, script, command } = req.body ?? {};

    if (!projectId || typeof projectId !== "string" || projectId.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Body field 'projectId' is required and must be a non-empty string",
      });
      return;
    }

    if (
      (!script || typeof script !== "string" || script.trim().length === 0) &&
      (!command || typeof command !== "string" || command.trim().length === 0)
    ) {
      res.status(400).json({
        success: false,
        error: "Body field 'script' is required and must be a non-empty string",
      });
      return;
    }

    const scriptName = script || (command ? "custom" : "");
    const process = await processManager.startProcess(projectId, scriptName, command);

    res.status(201).json({
      success: true,
      data: process,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const msg = error.message || "Failed to start process";

    if (msg.includes("not found in database") || msg.includes("not found on disk")) {
      res.status(404).json({ success: false, error: msg });
      return;
    }

    if (msg.includes("already active")) {
      res.status(409).json({ success: false, error: msg });
      return;
    }

    if (
      msg.includes("was not found in package.json") ||
      msg.includes("is required") ||
      msg.includes("must be a valid string")
    ) {
      res.status(400).json({ success: false, error: msg });
      return;
    }

    res.status(500).json({ success: false, error: msg });
  }
}

/**
 * Handles POST /api/processes/:processId/stop
 */
export async function stopProcessController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { processId } = req.params;

    if (!processId || typeof processId !== "string") {
      res.status(400).json({
        success: false,
        error: "Process ID is required",
      });
      return;
    }

    const process = await processManager.stopProcess(processId);

    res.status(200).json({
      success: true,
      data: process,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const msg = error.message || "Failed to stop process";

    if (msg.includes("not found")) {
      res.status(404).json({ success: false, error: msg });
      return;
    }

    res.status(500).json({ success: false, error: msg });
  }
}

/**
 * Handles POST /api/processes/:processId/restart
 */
export async function restartProcessController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { processId } = req.params;

    if (!processId || typeof processId !== "string") {
      res.status(400).json({
        success: false,
        error: "Process ID is required",
      });
      return;
    }

    const process = await processManager.restartProcess(processId);

    res.status(200).json({
      success: true,
      data: process,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const msg = error.message || "Failed to restart process";

    if (msg.includes("not found")) {
      res.status(404).json({ success: false, error: msg });
      return;
    }

    res.status(500).json({ success: false, error: msg });
  }
}

/**
 * Handles GET /api/processes
 * Lists running and recent managed processes, enriched with detected listening ports.
 */
export async function getProcessesController(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const processes = processManager.getAllProcesses();
    const portsMap = await detectPortsForProcesses(processes);

    const enriched = processes.map((proc) => {
      const info = portsMap.get(proc.id);
      return {
        ...proc,
        ports: info ? info.ports : [],
        portStatus: info ? info.portStatus : (proc.status === "running" ? "none" : "not_applicable"),
      };
    });

    res.status(200).json({
      success: true,
      data: enriched,
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || "Failed to list processes",
    });
  }
}

/**
 * Handles GET /api/processes/ports
 * Returns port information associated with DevDesk-managed processes only.
 */
export async function getProcessPortsController(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const processes = processManager.getAllProcesses();
    const portsMap = await detectPortsForProcesses(processes);
    const portInfos: ProcessPortInfo[] = Array.from(portsMap.values());

    res.status(200).json({
      success: true,
      data: portInfos,
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || "Failed to detect process ports",
    });
  }
}

/**
 * Handles GET /api/processes/:processId/logs?after=0
 * Incremental log retrieval.
 */
export async function getProcessLogsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { processId } = req.params;
    const afterParam = req.query.after;

    if (!processId || typeof processId !== "string") {
      res.status(400).json({
        success: false,
        error: "Process ID is required",
      });
      return;
    }

    let afterSequenceId = 0;
    if (typeof afterParam === "string") {
      const parsed = parseInt(afterParam, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        afterSequenceId = parsed;
      }
    }

    const result = processManager.getProcessLogs(processId, afterSequenceId);
    if (!result) {
      res.status(404).json({
        success: false,
        error: `Process with ID "${processId}" not found`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve process logs",
    });
  }
}

/**
 * Handles GET /api/processes/system-ports
 * Returns all listening TCP ports on the machine with PID, cwd, and process name.
 */
export async function getSystemPortsController(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const ports = await systemPortService.getSystemListeningPorts();
    res.status(200).json({
      success: true,
      data: ports,
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || "Failed to list system listening ports",
    });
  }
}

/**
 * Handles POST /api/processes/system-kill
 * Body: { pid: number, force?: boolean }
 */
export async function killSystemProcessController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { pid, force } = req.body ?? {};
    if (!pid || typeof pid !== "number" || isNaN(pid)) {
      res.status(400).json({
        success: false,
        error: "Body field 'pid' (number) is required",
      });
      return;
    }

    const result = await systemPortService.killProcess(pid, Boolean(force));
    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(400).json({
      success: false,
      error: error.message || "Failed to terminate process",
    });
  }
}

