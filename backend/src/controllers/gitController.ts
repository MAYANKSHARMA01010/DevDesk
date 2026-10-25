import { Request, Response } from "express";
import { gitService } from "../services/git/gitService.js";

/**
 * Handles GET /api/git/:projectId/status
 */
export async function getGitStatusController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId } = req.params;
    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({
        success: false,
        error: "Project ID parameter is required",
      });
      return;
    }

    const status = await gitService.getStatus(projectId);
    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const msg = error.message || "Failed to retrieve Git status";

    if (msg.includes("not found in database") || msg.includes("does not exist on disk")) {
      res.status(404).json({ success: false, error: msg });
      return;
    }

    if (msg.includes("not inside a Git repository")) {
      res.status(400).json({ success: false, error: msg });
      return;
    }

    res.status(500).json({ success: false, error: msg });
  }
}

/**
 * Handles GET /api/git/:projectId/branches
 */
export async function getGitBranchesController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId } = req.params;
    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({
        success: false,
        error: "Project ID parameter is required",
      });
      return;
    }

    const branches = await gitService.getBranches(projectId);
    res.status(200).json({
      success: true,
      data: branches,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const msg = error.message || "Failed to list Git branches";

    if (msg.includes("not found in database")) {
      res.status(404).json({ success: false, error: msg });
      return;
    }

    res.status(500).json({ success: false, error: msg });
  }
}

/**
 * Handles POST /api/git/:projectId/checkout
 * Body: { "branch": string }
 */
export async function checkoutBranchController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId } = req.params;
    const { branch } = req.body ?? {};

    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({
        success: false,
        error: "Project ID parameter is required",
      });
      return;
    }

    if (!branch || typeof branch !== "string" || branch.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Body field 'branch' is required and cannot be empty",
      });
      return;
    }

    const result = await gitService.checkoutBranch(projectId, branch.trim());
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const msg = error.message || "Failed to switch branch";

    if (msg.includes("not found in database")) {
      res.status(404).json({ success: false, error: msg });
      return;
    }

    if (
      msg.includes("would be overwritten by checkout") ||
      msg.includes("Please commit your changes or stash them")
    ) {
      res.status(409).json({ success: false, error: msg });
      return;
    }

    if (
      msg.includes("does not exist") ||
      msg.includes("Invalid branch name") ||
      msg.includes("is required")
    ) {
      res.status(400).json({ success: false, error: msg });
      return;
    }

    res.status(500).json({ success: false, error: msg });
  }
}

/**
 * Handles GET /api/git/:projectId/diff?file=<path>&staged=<boolean>
 */
export async function getGitDiffController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId } = req.params;
    const fileParam = req.query.file;
    const stagedParam = req.query.staged;

    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({
        success: false,
        error: "Project ID parameter is required",
      });
      return;
    }

    if (!fileParam || typeof fileParam !== "string" || fileParam.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Query parameter 'file' is required",
      });
      return;
    }

    const staged = stagedParam === "true" || stagedParam === "1";
    const diffResult = await gitService.getDiff(projectId, fileParam, staged);

    res.status(200).json({
      success: true,
      data: diffResult,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const msg = error.message || "Failed to retrieve diff";

    if (msg.includes("not found in database")) {
      res.status(404).json({ success: false, error: msg });
      return;
    }

    if (
      msg.includes("Absolute paths") ||
      msg.includes("Path traversal") ||
      msg.includes("is required")
    ) {
      res.status(400).json({ success: false, error: msg });
      return;
    }

    res.status(500).json({ success: false, error: msg });
  }
}

/**
 * Handles POST /api/git/:projectId/stage
 * Body: { "files"?: string[], "all"?: boolean }
 */
export async function stageFilesController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId } = req.params;
    const { files, all } = req.body ?? {};

    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({
        success: false,
        error: "Project ID parameter is required",
      });
      return;
    }

    if (!all && (!files || !Array.isArray(files) || files.length === 0)) {
      res.status(400).json({
        success: false,
        error: "Must provide 'files' array or specify 'all: true'",
      });
      return;
    }

    const result = await gitService.stageFiles(projectId, files, all);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const msg = error.message || "Failed to stage changes";

    if (msg.includes("not found in database")) {
      res.status(404).json({ success: false, error: msg });
      return;
    }

    if (msg.includes("Absolute paths") || msg.includes("Path traversal")) {
      res.status(400).json({ success: false, error: msg });
      return;
    }

    res.status(500).json({ success: false, error: msg });
  }
}

/**
 * Handles POST /api/git/:projectId/unstage
 * Body: { "files"?: string[], "all"?: boolean }
 */
export async function unstageFilesController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId } = req.params;
    const { files, all } = req.body ?? {};

    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({
        success: false,
        error: "Project ID parameter is required",
      });
      return;
    }

    if (!all && (!files || !Array.isArray(files) || files.length === 0)) {
      res.status(400).json({
        success: false,
        error: "Must provide 'files' array or specify 'all: true'",
      });
      return;
    }

    const result = await gitService.unstageFiles(projectId, files, all);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const msg = error.message || "Failed to unstage changes";

    if (msg.includes("not found in database")) {
      res.status(404).json({ success: false, error: msg });
      return;
    }

    if (msg.includes("Absolute paths") || msg.includes("Path traversal")) {
      res.status(400).json({ success: false, error: msg });
      return;
    }

    res.status(500).json({ success: false, error: msg });
  }
}

/**
 * Handles POST /api/git/:projectId/commit
 * Body: { "message": string }
 */
export async function commitController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId } = req.params;
    const { message, stageAll } = req.body ?? {};

    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({
        success: false,
        error: "Project ID parameter is required",
      });
      return;
    }

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Commit message is required and cannot be empty",
      });
      return;
    }

    const result = await gitService.commit(
      projectId,
      message.trim(),
      Boolean(stageAll)
    );
    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const msg = error.message || "Failed to commit changes";

    if (msg.includes("not found in database")) {
      res.status(404).json({ success: false, error: msg });
      return;
    }

    if (msg.includes("No staged changes to commit")) {
      res.status(409).json({ success: false, error: msg });
      return;
    }

    if (msg.includes("Commit message is required")) {
      res.status(400).json({ success: false, error: msg });
      return;
    }

    res.status(500).json({ success: false, error: msg });
  }
}

/**
 * Handles GET /api/git/:projectId/history?limit=20
 */
export async function getGitHistoryController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId } = req.params;
    const limitParam = req.query.limit;

    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({
        success: false,
        error: "Project ID parameter is required",
      });
      return;
    }

    let limit = 20;
    if (typeof limitParam === "string") {
      const parsed = parseInt(limitParam, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = parsed;
      }
    }

    const history = await gitService.getHistory(projectId, limit);
    res.status(200).json({
      success: true,
      data: history,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const msg = error.message || "Failed to retrieve Git history";

    if (msg.includes("not found in database")) {
      res.status(404).json({ success: false, error: msg });
      return;
    }

    res.status(500).json({ success: false, error: msg });
  }
}

/**
 * Handles POST /api/git/:projectId/push
 * Body: { "remote"?: string, "branch"?: string, "setUpstream"?: boolean }
 */
export async function pushGitController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId } = req.params;
    const { remote, branch, setUpstream } = req.body ?? {};

    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({
        success: false,
        error: "Project ID parameter is required",
      });
      return;
    }

    const result = await gitService.push(
      projectId,
      remote,
      branch,
      Boolean(setUpstream)
    );
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const msg = error.message || "Failed to push commits";

    if (msg.includes("not found in database")) {
      res.status(404).json({ success: false, error: msg });
      return;
    }

    res.status(500).json({ success: false, error: msg });
  }
}

/**
 * Handles POST /api/git/:projectId/pull
 * Body: { "remote"?: string, "branch"?: string }
 */
export async function pullGitController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId } = req.params;
    const { remote, branch } = req.body ?? {};

    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({
        success: false,
        error: "Project ID parameter is required",
      });
      return;
    }

    const result = await gitService.pull(projectId, remote, branch);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const msg = error.message || "Failed to pull commits";

    if (msg.includes("not found in database")) {
      res.status(404).json({ success: false, error: msg });
      return;
    }

    res.status(500).json({ success: false, error: msg });
  }
}

