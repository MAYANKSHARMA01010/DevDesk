import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  DiscoveredProject,
  PackageManager,
  ProjectType,
} from "../../types/project.js";

interface PackageJsonStructure {
  name?: string;
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Resolves home directory shorthand (~) and standardizes absolute path.
 */
export function resolveDirectoryPath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== "string") {
    throw new Error("Directory path must be a non-empty string");
  }

  const trimmed = inputPath.trim();
  if (trimmed.startsWith("~/") || trimmed === "~") {
    return path.join(os.homedir(), trimmed.slice(1));
  }

  return path.resolve(trimmed);
}

/**
 * Detects project type based on package.json dependencies and devDependencies.
 */
export function detectProjectType(pkg: PackageJsonStructure): ProjectType {
  const deps = pkg.dependencies ?? {};
  const devDeps = pkg.devDependencies ?? {};

  const has = (name: string): boolean =>
    Boolean(Object.prototype.hasOwnProperty.call(deps, name) ||
            Object.prototype.hasOwnProperty.call(devDeps, name));

  if (has("next")) {
    return "Next.js";
  }
  if (has("react")) {
    return "React";
  }
  if (has("express")) {
    return "Node.js / Express";
  }

  return "Node.js";
}

export async function detectPackageManager(
  directoryPath: string,
  pkg?: PackageJsonStructure
): Promise<PackageManager> {
  const lockfiles: Array<{ file: string; manager: PackageManager }> = [
    { file: "pnpm-lock.yaml", manager: "pnpm" },
    { file: "yarn.lock", manager: "yarn" },
    { file: "package-lock.json", manager: "npm" },
  ];

  // 1. Direct lockfile inside project directory
  for (const { file, manager } of lockfiles) {
    try {
      await fs.access(path.join(directoryPath, file));
      return manager;
    } catch {
      // Continue checking
    }
  }

  // 2. packageManager property in package.json (e.g., "pnpm@11.24.0")
  if (pkg?.packageManager) {
    if (pkg.packageManager.startsWith("pnpm")) return "pnpm";
    if (pkg.packageManager.startsWith("yarn")) return "yarn";
    if (pkg.packageManager.startsWith("npm")) return "npm";
  }

  // 3. Parent workspace lockfile (monorepo support)
  const parentDir = path.dirname(directoryPath);
  for (const { file, manager } of lockfiles) {
    try {
      await fs.access(path.join(parentDir, file));
      return manager;
    } catch {
      // Continue checking
    }
  }

  return "unknown";
}

/**
 * Scans immediate child directories of the given directory for valid projects.
 *
 * Independent service: does not depend on Express or Electron IPC.
 */
export async function scanProjectsDirectory(
  targetPath: string
): Promise<DiscoveredProject[]> {
  const resolvedPath = resolveDirectoryPath(targetPath);

  let stats;
  try {
    stats = await fs.stat(resolvedPath);
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      throw new Error(`Directory not found: "${resolvedPath}"`);
    }
    if (error.code === "EACCES") {
      throw new Error(`Permission denied accessing: "${resolvedPath}"`);
    }
    throw new Error(
      `Failed to access path "${resolvedPath}": ${error.message}`
    );
  }

  if (!stats.isDirectory()) {
    throw new Error(`Path is not a directory: "${resolvedPath}"`);
  }

  let entries;
  try {
    entries = await fs.readdir(resolvedPath, { withFileTypes: true });
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    throw new Error(
      `Failed to read directory "${resolvedPath}": ${error.message}`
    );
  }

  const discoveredProjects: DiscoveredProject[] = [];

  for (const entry of entries) {
    // 6. Ignore hidden directories, .git, node_modules, and non-directories
    if (
      entry.name.startsWith(".") ||
      entry.name === "node_modules" ||
      !entry.isDirectory()
    ) {
      continue;
    }

    const childDirPath = path.join(resolvedPath, entry.name);
    const packageJsonPath = path.join(childDirPath, "package.json");

    // 1. Check whether it contains a package.json
    let packageJsonContent: string;
    try {
      packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
    } catch {
      // 6. Ignore directories without package.json (or unreadable)
      continue;
    }

    // 2. Read package.json safely
    let parsedPackage: PackageJsonStructure;
    try {
      parsedPackage = JSON.parse(packageJsonContent);
    } catch {
      // Malformed package.json, skip
      continue;
    }

    // Determine project name (fallback to directory name if empty)
    const projectName =
      typeof parsedPackage.name === "string" && parsedPackage.name.trim().length > 0
        ? parsedPackage.name.trim()
        : entry.name;

    // 3. Detect project type
    const projectType = detectProjectType(parsedPackage);

    // 4. Detect package manager
    const packageManager = await detectPackageManager(childDirPath, parsedPackage);

    // 5. Add discovered project
    discoveredProjects.push({
      name: projectName,
      path: childDirPath,
      type: projectType,
      packageManager,
    });
  }

  return discoveredProjects;
}
