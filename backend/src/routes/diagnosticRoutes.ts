import { Router } from "express";
import { getDiagnosticsController } from "../controllers/diagnosticController.js";

const router = Router();

// GET /api/diagnostics
router.get("/", getDiagnosticsController);

export default router;
