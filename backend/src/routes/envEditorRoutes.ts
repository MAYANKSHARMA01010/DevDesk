import { Router } from "express";
import {
  getWorkspaceProjectsWithEnvController,
  listEnvFilesController,
  readEnvFileController,
  createEnvFileController,
  saveEnvFileController,
} from "../controllers/envEditorController.js";

const router = Router();

// GET /api/env-editor/workspaces/:workspaceId/projects-with-env - List project IDs containing .env files
router.get(
  "/workspaces/:workspaceId/projects-with-env",
  getWorkspaceProjectsWithEnvController
);

// GET /api/env-editor/:projectId/files - Lists available supported environment files
router.get("/:projectId/files", listEnvFilesController);

// GET /api/env-editor/:projectId/file?name=.env - Reads the selected environment file
router.get("/:projectId/file", readEnvFileController);

// POST /api/env-editor/:projectId/file - Creates a supported environment file
router.post("/:projectId/file", createEnvFileController);

// PUT /api/env-editor/:projectId/file - Saves validated content or structured changes
router.put("/:projectId/file", saveEnvFileController);

export default router;
