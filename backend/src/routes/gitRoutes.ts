import { Router } from "express";
import {
  checkoutBranchController,
  commitController,
  getGitBranchesController,
  getGitDiffController,
  getGitHistoryController,
  getGitStatusController,
  stageFilesController,
  unstageFilesController,
} from "../controllers/gitController.js";

const router = Router();

// GET /api/git/:projectId/status - Repository status and file changes
router.get("/:projectId/status", getGitStatusController);

// GET /api/git/:projectId/branches - Local and remote branch list
router.get("/:projectId/branches", getGitBranchesController);

// POST /api/git/:projectId/checkout - Switch to an existing local branch
router.post("/:projectId/checkout", checkoutBranchController);

// GET /api/git/:projectId/diff - View file diff (?file=...&staged=...)
router.get("/:projectId/diff", getGitDiffController);

// POST /api/git/:projectId/stage - Stage specific files or all
router.post("/:projectId/stage", stageFilesController);

// POST /api/git/:projectId/unstage - Unstage specific files or all
router.post("/:projectId/unstage", unstageFilesController);

// POST /api/git/:projectId/commit - Commit staged changes with message
router.post("/:projectId/commit", commitController);

// GET /api/git/:projectId/history - Recent commit history (?limit=20)
router.get("/:projectId/history", getGitHistoryController);

export default router;
