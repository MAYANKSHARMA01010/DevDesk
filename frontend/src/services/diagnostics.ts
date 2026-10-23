import { BACKEND_URL as BACKEND_BASE_URL } from "@/config/env";

export interface DiagnosticsData {
  status: string;
  app: string;
  version: string;
  platform: string;
  nodeVersion: string;
  uptime: number;
  appDataDir: string;
  dbPath: string;
  runningProcessesCount: number;
  timestamp: string;
}

export interface DiagnosticsResponse {
  success: boolean;
  data?: DiagnosticsData;
  error?: string;
}

/**
 * Retrieves application diagnostic data and system health from backend.
 * Calls GET http://localhost:5001/api/diagnostics
 */
export async function fetchDiagnostics(): Promise<DiagnosticsData> {
  const queryUrl = `${BACKEND_BASE_URL}/api/diagnostics`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}).`
    );
  }

  let json: DiagnosticsResponse;
  try {
    json = (await response.json()) as DiagnosticsResponse;
  } catch {
    throw new Error(
      `Received invalid response from backend (${response.status} ${response.statusText}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(
      json.error || `Backend request failed with status ${response.status}`
    );
  }

  return json.data;
}
