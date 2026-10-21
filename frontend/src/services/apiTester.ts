import {
  ApiTesterCancelResponse,
  ApiTesterExecuteResponse,
  ApiTesterRequest,
  ApiTesterResponseResult,
} from "@/types/apiTester";

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001";

/**
 * Sends an HTTP request via the DevDesk backend HTTP client.
 * Calls POST /api/api-tester/request
 */
export async function executeApiRequest(
  requestData: ApiTesterRequest
): Promise<ApiTesterResponseResult> {
  const queryUrl = `${BACKEND_BASE_URL}/api/api-tester/request`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: ApiTesterExecuteResponse;
  try {
    json = (await response.json()) as ApiTesterExecuteResponse;
  } catch {
    throw new Error(
      `Invalid response received from backend (${response.status}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to execute request (${response.status})`);
  }

  return json.data;
}

/**
 * Cancels an in-flight HTTP request.
 * Calls POST /api/api-tester/cancel/:requestId
 */
export async function cancelApiRequest(
  requestId: string
): Promise<{ requestId: string; cancelled: boolean; message: string }> {
  if (!requestId) {
    throw new Error("Request ID is required to cancel");
  }

  const queryUrl = `${BACKEND_BASE_URL}/api/api-tester/cancel/${encodeURIComponent(
    requestId.trim()
  )}`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "POST",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: ApiTesterCancelResponse;
  try {
    json = (await response.json()) as ApiTesterCancelResponse;
  } catch {
    throw new Error(
      `Invalid response received from backend (${response.status}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to cancel request (${response.status})`);
  }

  return json.data;
}
