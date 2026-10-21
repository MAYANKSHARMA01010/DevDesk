import { Router } from "express";
import {
  getProcessesController,
  getProcessLogsController,
  getProcessPortsController,
  restartProcessController,
  startProcessController,
  stopProcessController,
} from "../controllers/processController.js";

const router = Router();

// POST /api/processes/start - Start a project package script
router.post("/start", startProcessController);

// POST /api/processes/:processId/stop - Stop a managed process
router.post("/:processId/stop", stopProcessController);

// POST /api/processes/:processId/restart - Restart a process
router.post("/:processId/restart", restartProcessController);

// GET /api/processes/ports - Get detected listening ports for managed processes
router.get("/ports", getProcessPortsController);

// GET /api/processes - List running and recent processes (with detected ports)
router.get("/", getProcessesController);

// GET /api/processes/:processId/logs - Get incremental logs (?after=seqId)
router.get("/:processId/logs", getProcessLogsController);

export default router;
