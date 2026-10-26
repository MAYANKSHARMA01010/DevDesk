import { Request, Response } from "express";
import { getDataDirectory, getDatabasePath, resetLocalDatabase } from "../config/database.js";
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
        uptime: Math.floor(process.uptime()),
        uptimeSeconds: Math.floor(process.uptime()),
        appDataDir: getDataDirectory(),
        dataDirectory: getDataDirectory(),
        dbPath: getDatabasePath(),
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

/**
 * Handles POST /api/diagnostics/reset-database
 * Completely resets the local SQLite database to a clean state.
 */
export function resetDatabaseController(
  _req: Request,
  res: Response
): void {
  try {
    const result = resetLocalDatabase();
    if (result.success) {
      res.status(200).json({ success: true, message: result.message });
    } else {
      res.status(500).json({ success: false, error: result.message });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to reset database";
    res.status(500).json({ success: false, error: msg });
  }
}

