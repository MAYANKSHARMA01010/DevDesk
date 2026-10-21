import { Request, Response } from "express";
import { scanProjectsDirectory } from "../services/projects/projectScanner.js";

/**
 * Controller to handle GET /api/projects/scan?path=<directory>
 */
export async function scanProjectsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const rawPath = req.query.path;

    if (!rawPath || typeof rawPath !== "string" || rawPath.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Query parameter 'path' is required and must be a non-empty string",
      });
      return;
    }

    const projects = await scanProjectsDirectory(rawPath.trim());

    res.status(200).json({
      success: true,
      data: projects,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const message = error.message || "An unexpected error occurred while scanning projects";

    if (message.includes("Directory not found") || message.includes("not found")) {
      res.status(404).json({
        success: false,
        error: message,
      });
      return;
    }

    if (
      message.includes("is not a directory") ||
      message.includes("must be a non-empty string")
    ) {
      res.status(400).json({
        success: false,
        error: message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: message,
    });
  }
}

/**
 * Controller to handle GET /api/projects/:projectId/scripts
 * Discovers available scripts from package.json for a saved project.
 */
export async function getProjectScriptsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId } = req.params;

    if (!projectId || typeof projectId !== "string" || projectId.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Project ID is required and must be a non-empty string",
      });
      return;
    }

    const { discoverProjectScripts } = await import(
      "../services/projects/scriptDiscovery.js"
    );

    const result = await discoverProjectScripts(projectId.trim());

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const message = error.message || "Failed to discover project scripts";

    if (message.includes("Project not found") || message.includes("not found on disk")) {
      res.status(404).json({
        success: false,
        error: message,
      });
      return;
    }

    if (message.includes("is not a directory") || message.includes("is required")) {
      res.status(400).json({
        success: false,
        error: message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: message,
    });
  }
}

