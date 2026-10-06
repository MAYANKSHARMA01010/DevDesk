import { Router } from "express";
import { scanProjectsController } from "../controllers/projectController.js";

const router = Router();

// GET /api/projects/scan?path=<directory>
router.get("/scan", scanProjectsController);

export default router;
