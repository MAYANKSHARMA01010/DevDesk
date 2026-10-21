import {
  ManagedProcess,
  ProcessesListResponse,
  ProcessLogsResponse,
  ProcessLogsResult,
  ProcessPortInfo,
  ProcessPortsResponse,
  ProcessResponse,
  ProjectScriptsResponse,
} from "@/types/process";

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001";

/**
 * Fetches available package.json scripts for a saved project.
 * Calls GET /api/projects/:projectId/scripts
 */
export async function fetchProjectScripts(
  projectId: string
): Promise<Record<string, string>> {
  if (!projectId || typeof projectId !== "string") {
    throw new Error("Project ID is required");
  }

  const queryUrl = `${BACKEND_BASE_URL}/api/projects/${encodeURIComponent(
    projectId.trim()
  )}/scripts`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: ProjectScriptsResponse;
  try {
    json = (await response.json()) as ProjectScriptsResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to fetch scripts (${response.status})`);
  }

  return json.data.scripts;
}

/**
 * Starts a package script for a saved project.
 * Calls POST /api/processes/start
 */
export async function startProcess(
  projectId: string,
  script: string
): Promise<ManagedProcess> {
  const queryUrl = `${BACKEND_BASE_URL}/api/processes/start`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ projectId, script }),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: ProcessResponse;
  try {
    json = (await response.json()) as ProcessResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to start process (${response.status})`);
  }

  return json.data;
}

/**
 * Stops an active managed process.
 * Calls POST /api/processes/:processId/stop
 */
export async function stopProcess(processId: string): Promise<ManagedProcess> {
  const queryUrl = `${BACKEND_BASE_URL}/api/processes/${encodeURIComponent(
    processId
  )}/stop`;

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

  let json: ProcessResponse;
  try {
    json = (await response.json()) as ProcessResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to stop process (${response.status})`);
  }

  return json.data;
}

/**
 * Restarts a process with its saved project and script configuration.
 * Calls POST /api/processes/:processId/restart
 */
export async function restartProcess(
  processId: string
): Promise<ManagedProcess> {
  const queryUrl = `${BACKEND_BASE_URL}/api/processes/${encodeURIComponent(
    processId
  )}/restart`;

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

  let json: ProcessResponse;
  try {
    json = (await response.json()) as ProcessResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to restart process (${response.status})`);
  }

  return json.data;
}

/**
 * Lists all running and recent managed processes.
 * Calls GET /api/processes
 */
export async function fetchProcesses(): Promise<ManagedProcess[]> {
  const queryUrl = `${BACKEND_BASE_URL}/api/processes`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: ProcessesListResponse;
  try {
    json = (await response.json()) as ProcessesListResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to fetch processes (${response.status})`);
  }

  return json.data;
}

/**
 * Retrieves incremental log entries for a process after the given sequence ID.
 * Calls GET /api/processes/:processId/logs?after=seqId
 */
export async function fetchProcessLogs(
  processId: string,
  afterSequenceId: number = 0
): Promise<ProcessLogsResult> {
  const queryUrl = `${BACKEND_BASE_URL}/api/processes/${encodeURIComponent(
    processId
  )}/logs?after=${afterSequenceId}`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: ProcessLogsResponse;
  try {
    json = (await response.json()) as ProcessLogsResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to fetch process logs (${response.status})`);
  }

  return json.data;
}

/**
 * Retrieves listening port information for DevDesk-managed processes only.
 * Calls GET /api/processes/ports
 */
export async function fetchProcessPorts(): Promise<ProcessPortInfo[]> {
  const queryUrl = `${BACKEND_BASE_URL}/api/processes/ports`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: ProcessPortsResponse;
  try {
    json = (await response.json()) as ProcessPortsResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to fetch process ports (${response.status})`);
  }

  return json.data;
}
