import * as fs from "fs/promises";
import * as path from "path";
import { workspaceRepository } from "../workspaces/workspaceRepository.js";
import { ProjectScriptsResult } from "../../types/process.js";

/**
 * Discovers available npm/pnpm/yarn scripts for a saved project.
 * Resolves strictly from the saved project record in SQLite.
 * Never executes scripts during discovery.
 */
export async function discoverProjectScripts(
  projectId: string
): Promise<ProjectScriptsResult> {
  if (!projectId || typeof projectId !== "string" || projectId.trim().length === 0) {
    throw new Error("Project ID is required and must be a non-empty string");
  }

  const project = workspaceRepository.getProjectById(projectId.trim());
  if (!project) {
    throw new Error(`Project not found with ID "${projectId}"`);
  }

  // Validate directory existence on disk
  let stats;
  try {
    stats = await fs.stat(project.path);
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      throw new Error(`Project directory not found on disk: "${project.path}"`);
    }
    throw new Error(`Cannot access project path "${project.path}": ${error.message}`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`Project path is not a directory: "${project.path}"`);
  }

  const packageJsonPath = path.join(project.path, "package.json");
  let packageJsonRaw: string;
  try {
    packageJsonRaw = await fs.readFile(packageJsonPath, "utf-8");
  } catch {
    // Projects without package.json or unreadable return empty scripts object
    return {
      projectId: project.id,
      scripts: {},
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(packageJsonRaw);
  } catch {
    // Malformed package.json returns empty scripts object
    return {
      projectId: project.id,
      scripts: {},
    };
  }

  const scripts: Record<string, string> = {};
  if (
    parsed &&
    typeof parsed.scripts === "object" &&
    parsed.scripts !== null &&
    !Array.isArray(parsed.scripts)
  ) {
    for (const [name, definition] of Object.entries(parsed.scripts)) {
      if (typeof definition === "string") {
        scripts[name] = definition;
      }
    }
  }

  return {
    projectId: project.id,
    scripts,
  };
}
