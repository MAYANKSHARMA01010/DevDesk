import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import * as os from "os";
import {
  DiscoveredProject,
  PackageManager,
  ProjectType,
} from "../../types/project.js";
import { runGitCommand } from "../git/gitService.js";

interface PackageJsonStructure {
  name?: string;
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export const DEFAULT_IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "vendor",
  ".next",
  "dist",
  "build",
  "out",
  ".turbo",
  "coverage",
  ".venv",
  "venv",
  "env",
  "target",
  "bin",
  "obj",
  ".cache",
  ".pytest_cache",
  ".mypy_cache",
  "__pycache__",
  ".gradle",
  ".idea",
  ".vscode",
  ".expo",
]);

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
 * Redacts secrets, tokens, and passwords from Git remote URLs.
 * Never exposes credentials to the UI or persistence layers.
 */
export function sanitizeGitRemoteUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();

  if (trimmed.includes("://") && trimmed.includes("@")) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.password) {
        parsed.password = "***";
      }
      if (parsed.username && parsed.username !== "git") {
        parsed.username = "***";
      }
      return parsed.toString();
    } catch {
      // Fallback to regex below
    }
  }

  return trimmed.replace(
    /^([a-zA-Z]+:\/\/(?:[^:@/]+:)?)[^@/]+@/,
    (match) => {
      if (match.includes(":") && match.indexOf(":") !== match.indexOf("://")) {
        return match.split("://")[0] + "://***:***@";
      }
      return match.split("://")[0] + "://***@";
    }
  );
}

/**
 * Detects project type based on package.json dependencies and devDependencies.
 */
export function detectProjectType(pkg: PackageJsonStructure): ProjectType {
  const deps = pkg.dependencies ?? {};
  const devDeps = pkg.devDependencies ?? {};

  const has = (name: string): boolean =>
    Boolean(
      Object.prototype.hasOwnProperty.call(deps, name) ||
        Object.prototype.hasOwnProperty.call(devDeps, name)
    );

  if (has("next")) {
    return "Next.js";
  }
  if (has("react") || has("react-dom") || has("react-native") || has("expo")) {
    return "React";
  }
  if (has("express")) {
    return "Node.js / Express";
  }

  return "Node.js";
}

/**
 * Detects package manager for a JavaScript/TypeScript project.
 */
export async function detectPackageManager(
  directoryPath: string,
  pkg?: PackageJsonStructure
): Promise<PackageManager> {
  const lockfiles: Array<{ file: string; manager: PackageManager }> = [
    { file: "pnpm-lock.yaml", manager: "pnpm" },
    { file: "yarn.lock", manager: "yarn" },
    { file: "package-lock.json", manager: "npm" },
    { file: "bun.lockb", manager: "bun" },
    { file: "bun.lock", manager: "bun" },
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

  // 2. packageManager property in package.json (e.g., "pnpm@11.24.0", "bun@1.0.0")
  if (pkg?.packageManager) {
    if (pkg.packageManager.startsWith("pnpm")) return "pnpm";
    if (pkg.packageManager.startsWith("yarn")) return "yarn";
    if (pkg.packageManager.startsWith("npm")) return "npm";
    if (pkg.packageManager.startsWith("bun")) return "bun";
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
 * Checks for recognized project marker files (e.g., package.json, Cargo.toml, go.mod, etc.)
 */
export async function detectProjectMarker(directoryPath: string): Promise<{
  isProject: boolean;
  name: string;
  type: ProjectType;
  packageManager: PackageManager;
} | null> {
  // 1. Node.js / JavaScript / TypeScript ecosystem
  const packageJsonPath = path.join(directoryPath, "package.json");
  try {
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const parsed: PackageJsonStructure = JSON.parse(content);
    const projectName =
      typeof parsed.name === "string" && parsed.name.trim().length > 0
        ? parsed.name.trim()
        : path.basename(directoryPath);
    const projectType = detectProjectType(parsed);
    const pm = await detectPackageManager(directoryPath, parsed);
    return {
      isProject: true,
      name: projectName,
      type: projectType,
      packageManager: pm,
    };
  } catch {
    // Not a valid package.json
  }

  // 2. Rust ecosystem (Cargo.toml)
  const cargoPath = path.join(directoryPath, "Cargo.toml");
  if (fsSync.existsSync(cargoPath)) {
    let name = path.basename(directoryPath);
    try {
      const cargoContent = await fs.readFile(cargoPath, "utf-8");
      const nameMatch = cargoContent.match(/\[package\][^[]*name\s*=\s*"([^"]+)"/);
      if (nameMatch && nameMatch[1]) {
        name = nameMatch[1].trim();
      }
    } catch {
      // Fallback to directory name
    }
    return {
      isProject: true,
      name,
      type: "Rust",
      packageManager: "cargo",
    };
  }

  // 3. Go ecosystem (go.mod)
  const goModPath = path.join(directoryPath, "go.mod");
  if (fsSync.existsSync(goModPath)) {
    let name = path.basename(directoryPath);
    try {
      const modContent = await fs.readFile(goModPath, "utf-8");
      const modMatch = modContent.match(/^module\s+([^\s]+)/m);
      if (modMatch && modMatch[1]) {
        const modParts = modMatch[1].split("/");
        name = modParts[modParts.length - 1] || name;
      }
    } catch {
      // Fallback
    }
    return {
      isProject: true,
      name,
      type: "Go",
      packageManager: "go",
    };
  }

  // 4. Python ecosystem (pyproject.toml, requirements.txt, Pipfile, setup.py)
  const pyprojectPath = path.join(directoryPath, "pyproject.toml");
  const reqsPath = path.join(directoryPath, "requirements.txt");
  const pipfilePath = path.join(directoryPath, "Pipfile");
  const setupPyPath = path.join(directoryPath, "setup.py");

  if (
    fsSync.existsSync(pyprojectPath) ||
    fsSync.existsSync(reqsPath) ||
    fsSync.existsSync(pipfilePath) ||
    fsSync.existsSync(setupPyPath)
  ) {
    let name = path.basename(directoryPath);
    let pm: PackageManager = "pip";

    if (fsSync.existsSync(pipfilePath)) {
      pm = "pipenv";
    } else if (fsSync.existsSync(path.join(directoryPath, "poetry.lock"))) {
      pm = "poetry";
    }

    if (fsSync.existsSync(pyprojectPath)) {
      try {
        const pyContent = await fs.readFile(pyprojectPath, "utf-8");
        const nameMatch = pyContent.match(/name\s*=\s*"([^"]+)"/);
        if (nameMatch && nameMatch[1]) {
          name = nameMatch[1].trim();
        }
      } catch {
        // Fallback
      }
    }

    return {
      isProject: true,
      name,
      type: "Python",
      packageManager: pm,
    };
  }

  // 5. Java / JVM ecosystem (pom.xml, build.gradle, build.gradle.kts)
  if (fsSync.existsSync(path.join(directoryPath, "pom.xml"))) {
    return {
      isProject: true,
      name: path.basename(directoryPath),
      type: "Java",
      packageManager: "maven",
    };
  }
  if (
    fsSync.existsSync(path.join(directoryPath, "build.gradle")) ||
    fsSync.existsSync(path.join(directoryPath, "build.gradle.kts"))
  ) {
    return {
      isProject: true,
      name: path.basename(directoryPath),
      type: "Java",
      packageManager: "gradle",
    };
  }

  // 6. Ruby (Gemfile)
  if (fsSync.existsSync(path.join(directoryPath, "Gemfile"))) {
    return {
      isProject: true,
      name: path.basename(directoryPath),
      type: "Ruby",
      packageManager: "gem",
    };
  }

  // 7. PHP (composer.json)
  if (fsSync.existsSync(path.join(directoryPath, "composer.json"))) {
    return {
      isProject: true,
      name: path.basename(directoryPath),
      type: "PHP",
      packageManager: "composer",
    };
  }

  return null;
}

/**
 * Inspects Git repository information safely using read-only checks and discrete args.
 * Never mutates repository state.
 */
export async function detectGitInfo(directoryPath: string): Promise<{
  isGitRepo: boolean;
  gitRoot?: string;
  gitRemote?: string;
}> {
  const gitEntryPath = path.join(directoryPath, ".git");

  try {
    const exists = fsSync.existsSync(gitEntryPath);
    if (!exists) {
      return { isGitRepo: false };
    }

    const stat = await fs.stat(gitEntryPath);
    const isGitRepo = stat.isDirectory() || stat.isFile(); // handles git submodules/worktrees (.git file)

    if (!isGitRepo) {
      return { isGitRepo: false };
    }

    let gitRemote: string | undefined;
    try {
      const remoteCmd = await runGitCommand(
        directoryPath,
        ["config", "--get", "remote.origin.url"],
        1500
      );
      if (remoteCmd.code === 0 && remoteCmd.stdout.trim().length > 0) {
        gitRemote = sanitizeGitRemoteUrl(remoteCmd.stdout.trim());
      }
    } catch {
      // Ignore git remote errors
    }

    return {
      isGitRepo: true,
      gitRoot: directoryPath,
      gitRemote,
    };
  } catch {
    return { isGitRepo: false };
  }
}

export interface ScanOptions {
  maxDepth?: number;
  maxProjects?: number;
  includeRoot?: boolean;
}

/**
 * Recursively scans the given workspace directory for valid projects and Git repositories.
 * Follows DevDesk project boundary rules and guards against symlink loops.
 */
export async function scanProjectsDirectory(
  targetPath: string,
  options: ScanOptions = {}
): Promise<DiscoveredProject[]> {
  const maxDepth = typeof options.maxDepth === "number" && options.maxDepth >= 0 ? options.maxDepth : 5;
  const maxProjects = typeof options.maxProjects === "number" && options.maxProjects > 0 ? options.maxProjects : 200;
  const includeRoot = options.includeRoot !== false;

  const resolvedRoot = resolveDirectoryPath(targetPath);

  let rootStats;
  try {
    rootStats = await fs.stat(resolvedRoot);
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      throw new Error(`Directory not found: "${resolvedRoot}"`);
    }
    if (error.code === "EACCES") {
      throw new Error(`Permission denied accessing: "${resolvedRoot}"`);
    }
    throw new Error(`Failed to access path "${resolvedRoot}": ${error.message}`);
  }

  if (!rootStats.isDirectory()) {
    throw new Error(`Path is not a directory: "${resolvedRoot}"`);
  }

  const discoveredProjects: DiscoveredProject[] = [];
  const discoveredPaths = new Set<string>();
  const visitedRealPaths = new Set<string>();

  // Canonicalize workspace root
  let canonicalWorkspaceRoot: string;
  try {
    canonicalWorkspaceRoot = await fs.realpath(resolvedRoot);
  } catch {
    canonicalWorkspaceRoot = resolvedRoot;
  }
  visitedRealPaths.add(canonicalWorkspaceRoot);

  // 1. Check workspace root itself
  if (includeRoot) {
    const rootMarker = await detectProjectMarker(resolvedRoot);
    const rootGit = await detectGitInfo(resolvedRoot);

    if (rootMarker || rootGit.isGitRepo) {
      discoveredProjects.push({
        name: rootMarker?.name || path.basename(resolvedRoot),
        path: resolvedRoot,
        relativePath: ".",
        type: rootMarker?.type || "Git Repository",
        packageManager: rootMarker?.packageManager || "unknown",
        isGitRepo: rootGit.isGitRepo,
        gitRoot: rootGit.gitRoot,
        gitRemote: rootGit.gitRemote,
        isRoot: true,
      });
      discoveredPaths.add(resolvedRoot);
    }
  }

  // 2. Queue for breadth-first / depth-bounded recursive traversal
  interface QueueItem {
    dirPath: string;
    depth: number;
  }

  const queue: QueueItem[] = [{ dirPath: resolvedRoot, depth: 0 }];

  while (queue.length > 0 && discoveredProjects.length < maxProjects) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) {
      continue;
    }

    let entries;
    try {
      entries = await fs.readdir(current.dirPath, { withFileTypes: true });
    } catch {
      // Permission denied or unreadable directory; skip gracefully
      continue;
    }

    for (const entry of entries) {
      if (discoveredProjects.length >= maxProjects) {
        break;
      }

      // Ignore files and hidden directories (except .git which is checked explicitly via detectGitInfo)
      if (entry.name.startsWith(".")) {
        continue;
      }

      // Strictly exclude generated directories, build caches, and dependency trees
      if (DEFAULT_IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      const childPath = path.join(current.dirPath, entry.name);

      // Symlink and directory resolution
      let isDir = entry.isDirectory();
      let canonicalChildPath: string;

      if (entry.isSymbolicLink()) {
        try {
          canonicalChildPath = await fs.realpath(childPath);
          const stat = await fs.stat(canonicalChildPath);
          if (!stat.isDirectory()) {
            continue;
          }
          // Reject symlinks pointing outside the workspace root
          const relFromRoot = path.relative(canonicalWorkspaceRoot, canonicalChildPath);
          if (relFromRoot.startsWith("..") || path.isAbsolute(relFromRoot)) {
            continue;
          }
          isDir = true;
        } catch {
          // Broken symlink
          continue;
        }
      } else if (isDir) {
        try {
          canonicalChildPath = await fs.realpath(childPath);
        } catch {
          canonicalChildPath = childPath;
        }
      } else {
        // Not a directory or directory symlink
        continue;
      }

      if (!isDir) {
        continue;
      }

      // Detect symlink loops or multiple aliases
      if (visitedRealPaths.has(canonicalChildPath)) {
        continue;
      }
      visitedRealPaths.add(canonicalChildPath);

      // Check whether this directory matches any project marker or is a Git repository
      const marker = await detectProjectMarker(childPath);
      const gitInfo = await detectGitInfo(childPath);

      const relPath = path.relative(resolvedRoot, childPath).split(path.sep).join("/");

      if ((marker || gitInfo.isGitRepo) && !discoveredPaths.has(childPath)) {
        discoveredProjects.push({
          name: marker?.name || path.basename(childPath),
          path: childPath,
          relativePath: relPath,
          type: marker?.type || "Git Repository",
          packageManager: marker?.packageManager || "unknown",
          isGitRepo: gitInfo.isGitRepo,
          gitRoot: gitInfo.gitRoot,
          gitRemote: gitInfo.gitRemote,
          isRoot: false,
        });
        discoveredPaths.add(childPath);
      }

      // Continue recursing deeper up to maxDepth
      if (current.depth + 1 < maxDepth) {
        queue.push({
          dirPath: childPath,
          depth: current.depth + 1,
        });
      }
    }
  }

  // Sort: workspace root first if present, then alphabetical by relativePath
  return discoveredProjects.sort((a, b) => {
    if (a.isRoot && !b.isRoot) return -1;
    if (!a.isRoot && b.isRoot) return 1;
    const aPath = a.relativePath || a.name;
    const bPath = b.relativePath || b.name;
    return aPath.localeCompare(bPath);
  });
}
