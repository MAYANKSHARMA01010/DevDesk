import { Router } from "express";
import {
  getProjectScriptsController,
  scanProjectsController,
} from "../controllers/projectController.js";

const router = Router();

// GET /api/projects/scan?path=<directory>
router.get("/scan", scanProjectsController);

// GET /api/projects/:projectId/scripts
router.get("/:projectId/scripts", getProjectScriptsController);

export default router;
