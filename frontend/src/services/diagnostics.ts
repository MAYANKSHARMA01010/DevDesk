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

  const raw = (json.data || {}) as unknown as Record<string, unknown>;
  return {
    status: typeof raw.status === "string" ? raw.status : "ok",
    app: typeof raw.appName === "string" ? raw.appName : typeof raw.app === "string" ? raw.app : "DevDesk",
    version: typeof raw.version === "string" ? raw.version : "1.0.0",
    platform: typeof raw.platform === "string" ? (raw.arch ? `${raw.platform} (${raw.arch})` : raw.platform) : "—",
    nodeVersion: typeof raw.nodeVersion === "string" ? raw.nodeVersion : "—",
    uptime: Number(raw.uptime ?? raw.uptimeSeconds ?? 0),
    appDataDir: (raw.appDataDir || raw.dataDirectory || "") as string,
    dbPath: (raw.dbPath || raw.databasePath || "") as string,
    runningProcessesCount: Number(raw.runningProcessesCount ?? 0),
    timestamp: typeof raw.timestamp === "string" ? raw.timestamp : new Date().toISOString(),
  };
}
