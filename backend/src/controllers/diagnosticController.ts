import { Request, Response } from "express";
import { getDataDirectory, getDatabasePath } from "../config/database.js";
import { processManager } from "../services/processes/processManager.js";

/**
 * Handles GET /api/diagnostics
 * Returns non-sensitive application runtime health and diagnostic details.
 */
export function getDiagnosticsController(
  _req: Request,
  res: Response
): void {
  try {
    const allProcs = processManager.getAllProcesses();
    const runningProcs = allProcs.filter((p) => p.status === "running").length;

    res.status(200).json({
      success: true,
      data: {
        version: "1.0.0",
        appName: "DevDesk",
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        dataDirectory: getDataDirectory(),
        databasePath: getDatabasePath(),
        runningProcessesCount: runningProcs,
        totalProcessesCount: allProcs.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to get diagnostics";
    res.status(500).json({ success: false, error: msg });
  }
}
