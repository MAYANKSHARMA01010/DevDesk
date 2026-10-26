import { Router } from "express";
import {
  getDiagnosticsController,
  resetDatabaseController,
} from "../controllers/diagnosticController.js";

const router = Router();

// GET /api/diagnostics
router.get("/", getDiagnosticsController);

// POST /api/diagnostics/reset-database
router.post("/reset-database", resetDatabaseController);

export default router;
