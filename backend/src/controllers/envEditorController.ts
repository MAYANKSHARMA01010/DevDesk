import { Request, Response } from "express";
import {
  envEditorService,
  NotFoundError,
  ValidationError,
  ConflictError,
  SecurityError,
} from "../services/env-editor/envEditorService.js";

/**
 * Maps known service error types to HTTP response codes and messages.
 * Never includes raw environment values in error outputs.
 */
function handleError(res: Response, err: unknown, fallbackMessage: string): void {
  if (err instanceof NotFoundError) {
    res.status(404).json({ success: false, error: err.message });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({ success: false, error: err.message });
    return;
  }
  if (err instanceof SecurityError) {
    res.status(403).json({ success: false, error: err.message });
    return;
  }
  if (err instanceof ConflictError) {
    res.status(409).json({ success: false, error: err.message });
    return;
  }

  const error = err as Error;
  const msg = error?.message || fallbackMessage;
  res.status(500).json({ success: false, error: msg });
}

/**
 * Handles GET /api/env-editor/workspaces/:workspaceId/projects-with-env
 * Lists project IDs in the workspace that contain at least one .env file.
 */
export async function getWorkspaceProjectsWithEnvController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { workspaceId } = req.params;
    if (!workspaceId || typeof workspaceId !== "string") {
      res.status(400).json({
        success: false,
        error: "Workspace ID parameter is required.",
      });
      return;
    }

    const result = await envEditorService.getWorkspaceProjectsWithEnv(workspaceId);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    handleError(res, err, "Failed to inspect workspace projects for environment files.");
  }
}

/**
 * Handles GET /api/env-editor/:projectId/files
 * Lists available supported environment files without exposing values.
 */
export async function listEnvFilesController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId } = req.params;
    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({
        success: false,
        error: "Project ID parameter is required.",
      });
      return;
    }

    const result = await envEditorService.listEnvFiles(projectId);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    handleError(res, err, "Failed to list environment files.");
  }
}

/**
 * Handles GET /api/env-editor/:projectId/file?name=.env
 * Reads the selected environment file and returns structured entries and lines.
 */
export async function readEnvFileController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId } = req.params;
    const filename = req.query.name as string;

    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({
        success: false,
        error: "Project ID parameter is required.",
      });
      return;
    }

    if (!filename || typeof filename !== "string") {
      res.status(400).json({
        success: false,
        error: "Query parameter 'name' (environment filename) is required.",
      });
      return;
    }

    const result = await envEditorService.readEnvFile(projectId, filename);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    handleError(res, err, "Failed to read environment file.");
  }
}

/**
 * Handles POST /api/env-editor/:projectId/file
 * Creates a supported environment file. Fails if file already exists.
 */
export async function createEnvFileController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId } = req.params;
    const { filename } = req.body || {};

    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({
        success: false,
        error: "Project ID parameter is required.",
      });
      return;
    }

    if (!filename || typeof filename !== "string") {
      res.status(400).json({
        success: false,
        error: "Request body 'filename' is required.",
      });
      return;
    }

    const result = await envEditorService.createEnvFile(projectId, filename);
    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    handleError(res, err, "Failed to create environment file.");
  }
}

/**
 * Handles PUT /api/env-editor/:projectId/file
 * Atomically saves validated content or structured variable changes with conflict check and backup.
 */
export async function saveEnvFileController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId } = req.params;
    const { filename, content, variables, expectedLastModified } = req.body || {};

    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({
        success: false,
        error: "Project ID parameter is required.",
      });
      return;
    }

    if (!filename || typeof filename !== "string") {
      res.status(400).json({
        success: false,
        error: "Request body 'filename' is required.",
      });
      return;
    }

    const result = await envEditorService.saveEnvFile(projectId, filename, {
      content,
      variables,
      expectedLastModified,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    handleError(res, err, "Failed to save environment file.");
  }
}
