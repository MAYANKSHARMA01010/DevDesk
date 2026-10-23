import { Router } from "express";
import {
  cancelRequestController,
  discoverEndpointsByPathController,
  discoverEndpointsController,
  executeRequestController,
  getProjectsWithApisController,
} from "../controllers/apiTesterController.js";

const router = Router();

// GET /api/api-tester/projects-summary - Quick scan to find which projects contain APIs
router.get("/projects-summary", getProjectsWithApisController);

// GET /api/api-tester/discover - Automatically discover & analyze API endpoints for a project
router.get("/discover", discoverEndpointsController);

// POST /api/api-tester/discover-path - Discover & analyze API endpoints for any path
router.post("/discover-path", discoverEndpointsByPathController);

// POST /api/api-tester/request - Execute an HTTP request
router.post("/request", executeRequestController);

// POST /api/api-tester/cancel/:requestId - Cancel an in-flight request
router.post("/cancel/:requestId", cancelRequestController);

export default router;
