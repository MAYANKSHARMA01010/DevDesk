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

/**
 * Discovers and deeply analyzes all API routes in a project.
 * Calls GET /api/api-tester/discover?projectId=:projectId
 */
export async function fetchDiscoveredProjectApis(
  projectId: string
): Promise<import("@/types/apiDiscovery").ApiDiscoveryResult> {
  if (!projectId) {
    throw new Error("Project ID is required to discover APIs.");
  }

  const queryUrl = `${BACKEND_BASE_URL}/api/api-tester/discover?projectId=${encodeURIComponent(
    projectId.trim()
  )}`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}).`
    );
  }

  let json: import("@/types/apiDiscovery").ApiDiscoveryResponse;
  try {
    json = (await response.json()) as import("@/types/apiDiscovery").ApiDiscoveryResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to discover project APIs (${response.status})`);
  }

  return json.data;
}

/**
 * Discovers and analyzes API routes for any filesystem path.
 * Calls POST /api/api-tester/discover-path
 */
export async function fetchDiscoveredApisByPath(
  targetPath: string,
  name?: string
): Promise<import("@/types/apiDiscovery").ApiDiscoveryResult> {
  if (!targetPath) {
    throw new Error("Target path is required to discover APIs.");
  }

  const queryUrl = `${BACKEND_BASE_URL}/api/api-tester/discover-path`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: targetPath.trim(), name }),
      cache: "no-store",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}).`
    );
  }

  let json: import("@/types/apiDiscovery").ApiDiscoveryResponse;
  try {
    json = (await response.json()) as import("@/types/apiDiscovery").ApiDiscoveryResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to discover APIs (${response.status})`);
  }

  return json.data;
}

export interface ProjectApiSummary {
  id: string;
  workspaceId: string;
  name: string;
  displayName: string;
  path: string;
  type: string;
  endpointsCount: number;
  hasApis: boolean;
  baseUrlSuggestion?: string;
}

/**
 * Fetches API endpoint availability summary across projects.
 * Calls GET /api/api-tester/projects-summary
 */
export async function fetchProjectsWithApis(
  workspaceId?: string
): Promise<ProjectApiSummary[]> {
  const url = new URL(`${BACKEND_BASE_URL}/api/api-tester/projects-summary`);
  if (workspaceId) url.searchParams.set("workspaceId", workspaceId);

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.success && Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

