import { Request, Response } from "express";
import { apiTesterService } from "../services/api-tester/apiTesterService.js";
import { ApiTesterRequest } from "../types/apiTester.js";

/**
 * Handles POST /api/api-tester/request
 * Executes an HTTP request on behalf of the user.
 */
export async function executeRequestController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const requestData = req.body as ApiTesterRequest;

    if (!requestData || typeof requestData !== "object") {
      res.status(400).json({
        success: false,
        error: "Request body must be a valid JSON object",
      });
      return;
    }

    const result = await apiTesterService.executeRequest(requestData);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const error = err as Error;
    const msg = error.message || "Failed to execute request";

    if (
      msg.includes("Unsupported HTTP method") ||
      msg.includes("URL is required") ||
      msg.includes("Invalid URL format") ||
      msg.includes("Unsupported protocol") ||
      msg.includes("Invalid JSON request body")
    ) {
      res.status(400).json({ success: false, error: msg });
      return;
    }

    if (msg.includes("Request timed out")) {
      res.status(504).json({ success: false, error: msg });
      return;
    }

    if (msg.includes("Connection refused") || msg.includes("DNS resolution failed") || msg.includes("Network request failed")) {
      res.status(502).json({ success: false, error: msg });
      return;
    }

    if (msg.includes("Request was cancelled")) {
      res.status(499).json({ success: false, error: msg });
      return;
    }

    res.status(500).json({ success: false, error: msg });
  }
}

/**
 * Handles POST /api/api-tester/cancel/:requestId
 * Cancels an in-flight active request.
 */
export async function cancelRequestController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { requestId } = req.params;

    if (!requestId || typeof requestId !== "string" || requestId.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Parameter 'requestId' is required",
      });
      return;
    }

    const cancelled = apiTesterService.cancelRequest(requestId.trim());

    res.status(200).json({
      success: true,
      data: {
        requestId: requestId.trim(),
        cancelled,
        message: cancelled
          ? `Request "${requestId}" was cancelled successfully`
          : `No active in-flight request found for ID "${requestId}"`,
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || "Failed to cancel request",
    });
  }
}

/**
 * Handles GET /api/api-tester/discover?projectId=...
 * Discovers and deeply analyzes all API routes in the specified project.
 */
export async function discoverEndpointsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== "string" || !projectId.trim()) {
      res.status(400).json({
        success: false,
        error: "Query parameter 'projectId' is required",
      });
      return;
    }

    const { workspaceRepository } = await import(
      "../services/workspaces/workspaceRepository.js"
    );
    const { apiDiscoveryService } = await import(
      "../services/api-tester/apiDiscoveryService.js"
    );

    const project = workspaceRepository.getProjectById(projectId.trim());
    if (!project) {
      res.status(404).json({
        success: false,
        error: `Project not found with ID "${projectId}"`,
      });
      return;
    }

    const result = await apiDiscoveryService.discoverProjectEndpoints(
      project.path,
      project.displayName || project.name,
      project.id
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || "Failed to discover API endpoints",
    });
  }
}

/**
 * Handles POST /api/api-tester/discover-path
 * Scans any filesystem path for API routes.
 */
export async function discoverEndpointsByPathController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { path: targetPath, name } = req.body || {};

    if (!targetPath || typeof targetPath !== "string" || !targetPath.trim()) {
      res.status(400).json({
        success: false,
        error: "Body parameter 'path' is required",
      });
      return;
    }

    const { apiDiscoveryService } = await import(
      "../services/api-tester/apiDiscoveryService.js"
    );

    const resolvedPath = targetPath.trim();
    const resolvedName = name || resolvedPath.split("/").pop() || "Project";

    const result = await apiDiscoveryService.discoverProjectEndpoints(
      resolvedPath,
      resolvedName,
      `custom-${Date.now()}`
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || "Failed to discover API endpoints",
    });
  }
}

/**
 * Handles GET /api/api-tester/projects-summary?workspaceId=...
 * Quickly checks all workspace projects and returns which ones contain APIs.
 */
export async function getProjectsWithApisController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { workspaceId } = req.query;

    const { workspaceRepository } = await import(
      "../services/workspaces/workspaceRepository.js"
    );
    const { apiDiscoveryService } = await import(
      "../services/api-tester/apiDiscoveryService.js"
    );

    let projects: any[] = [];
    if (workspaceId && typeof workspaceId === "string" && workspaceId.trim()) {
      const ws = workspaceRepository.getById(workspaceId.trim());
      projects = ws?.projects || [];
    } else {
      const workspaces = workspaceRepository.getAll();
      projects = workspaces.flatMap((w) => w.projects);
    }

    const summaries = await Promise.all(
      projects.map(async (p) => {
        try {
          const discovery = await apiDiscoveryService.discoverProjectEndpoints(
            p.path,
            p.displayName || p.name,
            p.id
          );
          return {
            id: p.id,
            workspaceId: p.workspaceId,
            name: p.name,
            displayName: p.displayName || p.name,
            path: p.path,
            type: p.type,
            endpointsCount: discovery.endpoints.length,
            hasApis: discovery.endpoints.length > 0,
            baseUrlSuggestion: discovery.baseUrlSuggestion,
          };
        } catch {
          return {
            id: p.id,
            workspaceId: p.workspaceId,
            name: p.name,
            displayName: p.displayName || p.name,
            path: p.path,
            type: p.type,
            endpointsCount: 0,
            hasApis: false,
          };
        }
      })
    );

    res.status(200).json({
      success: true,
      data: summaries,
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || "Failed to get projects API summary",
    });
  }
}

