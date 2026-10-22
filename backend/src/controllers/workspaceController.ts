import { Request, Response } from "express";
import { workspaceRepository } from "../services/workspaces/workspaceRepository.js";
import {
  resolveDirectoryPath,
  scanProjectsDirectory,
} from "../services/projects/projectScanner.js";
import * as fs from "fs/promises";

/**
 * Controller to handle GET /api/workspaces
 * Returns saved workspaces ordered by most recently opened.
 */
export async function getWorkspacesController(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const workspaces = workspaceRepository.getAll();
    res.status(200).json({
      success: true,
      data: workspaces,
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve workspaces",
    });
  }
}

/**
 * Controller to handle POST /api/workspaces/scan
 * Scans a workspace root, persists metadata and projects in SQLite, and returns the result.
 */
export async function scanWorkspaceController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const rawPath = req.body?.path;

    if (!rawPath || typeof rawPath !== "string" || rawPath.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Body parameter 'path' is required and must be a non-empty string",
      });
      return;
    }

    let resolvedPath: string;
    try {
      resolvedPath = resolveDirectoryPath(rawPath.trim());
    } catch (err: unknown) {
      const error = err as Error;
      res.status(400).json({
        success: false,
        error: error.message,
      });
      return;
    }

    // Check directory existence and type
    let stats;
    try {
      stats = await fs.stat(resolvedPath);
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ENOENT") {
        res.status(404).json({
          success: false,
          error: `Directory not found: "${resolvedPath}"`,
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: `Cannot access path "${resolvedPath}": ${error.message}`,
      });
      return;
    }

    if (!stats.isDirectory()) {
      res.status(400).json({
        success: false,
        error: `Path is not a directory: "${resolvedPath}"`,
      });
      return;
    }

    const includeRoot = req.body?.includeRoot !== undefined ? Boolean(req.body.includeRoot) : true;
    const maxDepth = typeof req.body?.maxDepth === "number" ? req.body.maxDepth : 5;
    const maxProjects = typeof req.body?.maxProjects === "number" ? req.body.maxProjects : undefined;

    // Reuse existing project scanner service
    const discoveredProjects = await scanProjectsDirectory(resolvedPath, {
      includeRoot,
      maxDepth,
      maxProjects,
    });

    // Save or update workspace in SQLite transaction
    const savedWorkspace = workspaceRepository.upsertWithProjects(
      resolvedPath,
      discoveredProjects
    );

    res.status(200).json({
      success: true,
      data: savedWorkspace,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const message = error.message || "Failed to scan workspace";

    if (message.includes("Directory not found")) {
      res.status(404).json({ success: false, error: message });
      return;
    }

    if (message.includes("is not a directory") || message.includes("must be a non-empty string")) {
      res.status(400).json({ success: false, error: message });
      return;
    }

    res.status(500).json({
      success: false,
      error: message,
    });
  }
}

/**
 * Controller to handle DELETE /api/workspaces/:id
 * Removes saved workspace and project metadata from SQLite.
 * Does NOT delete or alter files on disk.
 */
export async function deleteWorkspaceController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    if (!id || typeof id !== "string" || id.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Workspace ID is required",
      });
      return;
    }

    const existing = workspaceRepository.getById(id);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: "Workspace not found",
      });
      return;
    }

    const deleted = workspaceRepository.delete(id);
    if (!deleted) {
      res.status(500).json({
        success: false,
        error: "Failed to delete workspace record",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Workspace removed successfully",
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || "An unexpected error occurred while deleting workspace",
    });
  }
}

/**
 * Controller to handle PATCH /api/workspaces/:id/open
 * Updates the last-opened timestamp for quick workspace switching.
 */
export async function openWorkspaceController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    if (!id || typeof id !== "string") {
      res.status(400).json({ success: false, error: "Workspace ID is required" });
      return;
    }

    const existing = workspaceRepository.getById(id);
    if (!existing) {
      res.status(404).json({ success: false, error: "Workspace not found" });
      return;
    }

    workspaceRepository.updateLastOpened(id);
    const updated = workspaceRepository.getById(id);

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || "Failed to update workspace",
    });
  }
}
