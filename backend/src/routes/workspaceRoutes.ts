import { Router } from "express";
import {
  deleteWorkspaceController,
  getWorkspacesController,
  openWorkspaceController,
  scanWorkspaceController,
} from "../controllers/workspaceController.js";

const router = Router();

// GET /api/workspaces - List all saved workspaces with their projects
router.get("/", getWorkspacesController);

// POST /api/workspaces/scan - Scan directory and persist workspace + projects
router.post("/scan", scanWorkspaceController);

// DELETE /api/workspaces/:id - Delete saved workspace and its projects (never deletes files on disk)
router.delete("/:id", deleteWorkspaceController);

// PATCH /api/workspaces/:id/open - Mark workspace as most recently opened
router.patch("/:id/open", openWorkspaceController);

export default router;
