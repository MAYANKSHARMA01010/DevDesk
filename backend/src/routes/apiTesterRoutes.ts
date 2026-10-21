import { Router } from "express";
import {
  cancelRequestController,
  executeRequestController,
} from "../controllers/apiTesterController.js";

const router = Router();

// POST /api/api-tester/request - Execute an HTTP request
router.post("/request", executeRequestController);

// POST /api/api-tester/cancel/:requestId - Cancel an in-flight request
router.post("/cancel/:requestId", cancelRequestController);

export default router;
