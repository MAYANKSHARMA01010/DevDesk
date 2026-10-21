import {
  GitBranchesResponse,
  GitBranchesResult,
  GitCommitResponse,
  GitCommitResult,
  GitDiffResponse,
  GitDiffResult,
  GitHistoryResponse,
  GitHistoryResult,
  GitStageResponse,
  GitStatusResponse,
  GitStatusResult,
  GitUnstageResponse,
} from "@/types/git";

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001";

/**
 * Retrieves repository status for a saved project.
 * Calls GET /api/git/:projectId/status
 */
export async function fetchGitStatus(
  projectId: string
): Promise<GitStatusResult> {
  if (!projectId || typeof projectId !== "string") {
    throw new Error("Project ID is required");
  }

  const queryUrl = `${BACKEND_BASE_URL}/api/git/${encodeURIComponent(
    projectId.trim()
  )}/status`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: GitStatusResponse;
  try {
    json = (await response.json()) as GitStatusResponse;
  } catch {
    throw new Error(
      `Invalid response received from backend (${response.status}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to fetch Git status (${response.status})`);
  }

  return json.data;
}

/**
 * Retrieves local and remote branches.
 * Calls GET /api/git/:projectId/branches
 */
export async function fetchGitBranches(
  projectId: string
): Promise<GitBranchesResult> {
  if (!projectId || typeof projectId !== "string") {
    throw new Error("Project ID is required");
  }

  const queryUrl = `${BACKEND_BASE_URL}/api/git/${encodeURIComponent(
    projectId.trim()
  )}/branches`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: GitBranchesResponse;
  try {
    json = (await response.json()) as GitBranchesResponse;
  } catch {
    throw new Error(
      `Invalid response received from backend (${response.status}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to fetch branches (${response.status})`);
  }

  return json.data;
}

/**
 * Switches to an existing local branch.
 * Calls POST /api/git/:projectId/checkout
 */
export async function checkoutBranch(
  projectId: string,
  branch: string
): Promise<{ branch: string; message: string }> {
  const queryUrl = `${BACKEND_BASE_URL}/api/git/${encodeURIComponent(
    projectId.trim()
  )}/checkout`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch }),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: { success: boolean; data?: { branch: string; message: string }; error?: string };
  try {
    json = await response.json();
  } catch {
    throw new Error(
      `Invalid response received from backend (${response.status}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to checkout branch (${response.status})`);
  }

  return json.data;
}

/**
 * Retrieves file diff for a changed file.
 * Calls GET /api/git/:projectId/diff?file=...&staged=...
 */
export async function fetchGitDiff(
  projectId: string,
  file: string,
  staged: boolean = false
): Promise<GitDiffResult> {
  const queryUrl = `${BACKEND_BASE_URL}/api/git/${encodeURIComponent(
    projectId.trim()
  )}/diff?file=${encodeURIComponent(file)}&staged=${staged ? "true" : "false"}`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: GitDiffResponse;
  try {
    json = (await response.json()) as GitDiffResponse;
  } catch {
    throw new Error(
      `Invalid response received from backend (${response.status}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to fetch diff (${response.status})`);
  }

  return json.data;
}

/**
 * Stages specific files or all changes.
 * Calls POST /api/git/:projectId/stage
 */
export async function stageGitFiles(
  projectId: string,
  files?: string[],
  all?: boolean
): Promise<{ stagedCount: number; files: string[] }> {
  const queryUrl = `${BACKEND_BASE_URL}/api/git/${encodeURIComponent(
    projectId.trim()
  )}/stage`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files, all }),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: GitStageResponse;
  try {
    json = (await response.json()) as GitStageResponse;
  } catch {
    throw new Error(
      `Invalid response received from backend (${response.status}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to stage changes (${response.status})`);
  }

  return json.data;
}

/**
 * Unstages specific files or all changes without modifying working-tree files.
 * Calls POST /api/git/:projectId/unstage
 */
export async function unstageGitFiles(
  projectId: string,
  files?: string[],
  all?: boolean
): Promise<{ unstagedCount: number; files: string[] }> {
  const queryUrl = `${BACKEND_BASE_URL}/api/git/${encodeURIComponent(
    projectId.trim()
  )}/unstage`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files, all }),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: GitUnstageResponse;
  try {
    json = (await response.json()) as GitUnstageResponse;
  } catch {
    throw new Error(
      `Invalid response received from backend (${response.status}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to unstage changes (${response.status})`);
  }

  return json.data;
}

/**
 * Commits staged changes with a message.
 * Calls POST /api/git/:projectId/commit
 */
export async function commitGitChanges(
  projectId: string,
  message: string
): Promise<GitCommitResult> {
  const queryUrl = `${BACKEND_BASE_URL}/api/git/${encodeURIComponent(
    projectId.trim()
  )}/commit`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: GitCommitResponse;
  try {
    json = (await response.json()) as GitCommitResponse;
  } catch {
    throw new Error(
      `Invalid response received from backend (${response.status}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to commit changes (${response.status})`);
  }

  return json.data;
}

/**
 * Retrieves recent commit history.
 * Calls GET /api/git/:projectId/history?limit=20
 */
export async function fetchGitHistory(
  projectId: string,
  limit: number = 20
): Promise<GitHistoryResult> {
  const queryUrl = `${BACKEND_BASE_URL}/api/git/${encodeURIComponent(
    projectId.trim()
  )}/history?limit=${limit}`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: GitHistoryResponse;
  try {
    json = (await response.json()) as GitHistoryResponse;
  } catch {
    throw new Error(
      `Invalid response received from backend (${response.status}).`
    );
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to fetch history (${response.status})`);
  }

  return json.data;
}
