import {
  EnvFileContentResponse,
  EnvFileContentResult,
  EnvFileCreateResponse,
  EnvFilesListResponse,
  EnvFilesListResult,
  EnvFileSaveRequest,
  EnvFileSaveResponse,
  EnvFileSaveResult,
} from "@/types/env-editor";

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001";

/**
 * Fetches the list of supported environment files for a project without exposing variable values.
 * Calls GET /api/env-editor/:projectId/files
 */
export async function fetchEnvFiles(
  projectId: string
): Promise<EnvFilesListResult> {
  if (!projectId) {
    throw new Error("Project ID is required to fetch environment files.");
  }

  const queryUrl = `${BACKEND_BASE_URL}/api/env-editor/${encodeURIComponent(
    projectId
  )}/files`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: EnvFilesListResponse;
  try {
    json = (await response.json()) as EnvFilesListResponse;
  } catch {
    throw new Error(
      `Invalid response received from backend (${response.status} ${response.statusText}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(
      json.error || `Failed to list environment files (${response.status})`
    );
  }

  return json.data;
}

/**
 * Reads a supported environment file and returns structured lines and parsed entries.
 * Calls GET /api/env-editor/:projectId/file?name=:filename
 */
export async function readEnvFile(
  projectId: string,
  filename: string
): Promise<EnvFileContentResult> {
  if (!projectId) {
    throw new Error("Project ID is required to read environment file.");
  }
  if (!filename) {
    throw new Error("Filename is required to read environment file.");
  }

  const queryUrl = `${BACKEND_BASE_URL}/api/env-editor/${encodeURIComponent(
    projectId
  )}/file?name=${encodeURIComponent(filename)}`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}).`
    );
  }

  let json: EnvFileContentResponse;
  try {
    json = (await response.json()) as EnvFileContentResponse;
  } catch {
    throw new Error(
      `Invalid response received from backend (${response.status} ${response.statusText}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(
      json.error || `Failed to read environment file "${filename}" (${response.status})`
    );
  }

  return json.data;
}

/**
 * Creates a new supported environment file. Fails if the file already exists.
 * Calls POST /api/env-editor/:projectId/file
 */
export async function createEnvFile(
  projectId: string,
  filename: string
): Promise<{ filename: string; message: string }> {
  if (!projectId) {
    throw new Error("Project ID is required to create environment file.");
  }
  if (!filename) {
    throw new Error("Filename is required to create environment file.");
  }

  const queryUrl = `${BACKEND_BASE_URL}/api/env-editor/${encodeURIComponent(
    projectId
  )}/file`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filename }),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}).`
    );
  }

  let json: EnvFileCreateResponse;
  try {
    json = (await response.json()) as EnvFileCreateResponse;
  } catch {
    throw new Error(
      `Invalid response received from backend (${response.status} ${response.statusText}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(
      json.error || `Failed to create environment file "${filename}" (${response.status})`
    );
  }

  return json.data;
}

/**
 * Atomically saves an environment file with conflict check and safety backup.
 * Calls PUT /api/env-editor/:projectId/file
 */
export async function saveEnvFile(
  projectId: string,
  saveData: EnvFileSaveRequest
): Promise<EnvFileSaveResult> {
  if (!projectId) {
    throw new Error("Project ID is required to save environment file.");
  }
  if (!saveData || !saveData.filename) {
    throw new Error("Filename is required in save payload.");
  }

  const queryUrl = `${BACKEND_BASE_URL}/api/env-editor/${encodeURIComponent(
    projectId
  )}/file`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(saveData),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}).`
    );
  }

  let json: EnvFileSaveResponse;
  try {
    json = (await response.json()) as EnvFileSaveResponse;
  } catch {
    throw new Error(
      `Invalid response received from backend (${response.status} ${response.statusText}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(
      json.error || `Failed to save environment file "${saveData.filename}" (${response.status})`
    );
  }

  return json.data;
}

/**
 * Fetches IDs of projects in a workspace that have at least one .env file on disk.
 * Calls GET /api/env-editor/workspaces/:workspaceId/projects-with-env
 */
export async function fetchWorkspaceProjectsWithEnv(
  workspaceId: string
): Promise<string[]> {
  if (!workspaceId) return [];

  const queryUrl = `${BACKEND_BASE_URL}/api/env-editor/workspaces/${encodeURIComponent(
    workspaceId
  )}/projects-with-env`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}).`
    );
  }

  let json: { success: boolean; data?: string[]; error?: string };
  try {
    json = await response.json();
  } catch {
    throw new Error(
      `Invalid response received from backend (${response.status} ${response.statusText}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(
      json.error || `Failed to fetch projects with environment files (${response.status})`
    );
  }

  return json.data;
}

