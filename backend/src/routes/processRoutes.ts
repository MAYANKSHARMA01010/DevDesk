import { Router } from "express";
import {
  getProcessesController,
  getProcessLogsController,
  getProcessPortsController,
  getSystemPortsController,
  killSystemProcessController,
  restartProcessController,
  startProcessController,
  stopProcessController,
} from "../controllers/processController.js";

const router = Router();

// GET /api/processes/system-ports - List all system listening TCP ports
router.get("/system-ports", getSystemPortsController);

// POST /api/processes/system-kill - Kill any system process by PID
router.post("/system-kill", killSystemProcessController);

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

