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
