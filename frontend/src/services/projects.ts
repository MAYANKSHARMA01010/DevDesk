import { DiscoveredProject, ProjectScanResponse } from "@/types/project";

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001";

/**
 * Scans immediate child directories of the given path for developer projects.
 * Calls GET http://localhost:5001/api/projects/scan?path=<encoded path>
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
