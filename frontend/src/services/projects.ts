import {
  DiscoveredProject,
  ProjectScanResponse,
  WorkspaceResponse,
  WorkspacesResponse,
  WorkspaceWithProjects,
} from "@/types/project";

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001";

/**
 * Retrieves all saved workspaces and their projects from SQLite via backend.
 * Calls GET http://localhost:5001/api/workspaces
 */
export async function fetchWorkspaces(): Promise<WorkspaceWithProjects[]> {
  const queryUrl = `${BACKEND_BASE_URL}/api/workspaces`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend server is running on port 5001.`
    );
  }

  let json: WorkspacesResponse;
  try {
    json = (await response.json()) as WorkspacesResponse;
  } catch {
    throw new Error(
      `Received invalid response from backend (${response.status} ${response.statusText}).`
    );
  }

  if (!response.ok || !json.success) {
    throw new Error(
      json.error || `Backend request failed with status ${response.status}`
    );
  }

  return json.data || [];
}

/**
 * Scans a workspace root directory and persists the workspace and its projects in SQLite.
 * Calls POST http://localhost:5001/api/workspaces/scan
 */
export async function scanAndSaveWorkspace(
  directoryPath: string
): Promise<WorkspaceWithProjects> {
  if (!directoryPath || typeof directoryPath !== "string" || directoryPath.trim().length === 0) {
    throw new Error("A valid directory path is required to scan workspace.");
  }

  const queryUrl = `${BACKEND_BASE_URL}/api/workspaces/scan`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: directoryPath.trim() }),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend server is running on port 5001.`
    );
  }

  let json: WorkspaceResponse;
  try {
    json = (await response.json()) as WorkspaceResponse;
  } catch {
    throw new Error(
      `Received invalid response from backend (${response.status} ${response.statusText}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(
      json.error || `Failed to scan and save workspace (status: ${response.status}).`
    );
  }

  return json.data;
}

/**
 * Removes a workspace record and its saved projects from SQLite.
 * NEVER deletes or modifies actual files on the filesystem.
 * Calls DELETE http://localhost:5001/api/workspaces/:id
 */
export async function forgetWorkspace(id: string): Promise<void> {
  if (!id || typeof id !== "string") {
    throw new Error("A workspace ID is required.");
  }

  const queryUrl = `${BACKEND_BASE_URL}/api/workspaces/${encodeURIComponent(id)}`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "DELETE",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend server is running on port 5001.`
    );
  }

  let json: WorkspaceResponse;
  try {
    json = (await response.json()) as WorkspaceResponse;
  } catch {
    throw new Error(
      `Received invalid response from backend (${response.status} ${response.statusText}).`
    );
  }

  if (!response.ok || !json.success) {
    throw new Error(
      json.error || `Failed to forget workspace (status: ${response.status}).`
    );
  }
}

/**
 * Updates a workspace's last opened timestamp for switching.
 * Calls PATCH http://localhost:5001/api/workspaces/:id/open
 */
export async function markWorkspaceOpened(
  id: string
): Promise<WorkspaceWithProjects> {
  const queryUrl = `${BACKEND_BASE_URL}/api/workspaces/${encodeURIComponent(id)}/open`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "PATCH",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend server is running on port 5001.`
    );
  }

  let json: WorkspaceResponse;
  try {
    json = (await response.json()) as WorkspaceResponse;
  } catch {
    throw new Error(
      `Received invalid response from backend (${response.status} ${response.statusText}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(
      json.error || `Failed to update workspace last opened (status: ${response.status}).`
    );
  }

  return json.data;
}

/**
 * Scans immediate child directories of the given path for developer projects.
 * Calls GET http://localhost:5001/api/projects/scan?path=<encoded path>
 * Maintained for backward compatibility.
 */
export async function scanProjects(
  directoryPath: string
): Promise<DiscoveredProject[]> {
  if (!directoryPath || typeof directoryPath !== "string" || directoryPath.trim().length === 0) {
    throw new Error("A valid directory path is required to scan projects.");
  }

  const queryUrl = `${BACKEND_BASE_URL}/api/projects/scan?path=${encodeURIComponent(
    directoryPath.trim()
  )}`;

  let response: Response;
  try {
    response = await fetch(queryUrl);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend server is running on port 5001.`
    );
  }

  let json: ProjectScanResponse;
  try {
    json = (await response.json()) as ProjectScanResponse;
  } catch {
    throw new Error(
      `Received invalid response from backend (${response.status} ${response.statusText}).`
    );
  }

  if (!response.ok || !json.success) {
    throw new Error(
      json.error || `Backend request failed with status ${response.status}`
    );
  }

  if (!Array.isArray(json.data)) {
    throw new Error("Malformed project data received from backend.");
  }

  return json.data;
}
