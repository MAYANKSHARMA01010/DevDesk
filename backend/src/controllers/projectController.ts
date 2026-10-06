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
