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
  "generated",
  "__generated__",
  ".prisma",
  "site-packages",
  ".nyc_output",
  "fixtures",
  "__fixtures__",
  ".changeset",
  ".manifests",
  "scratch",
  ".parcel-cache",
  ".yarn",
  "src-tauri",
]);

/**
 * Boilerplate directory segments too generic to serve as a project qualifier or unique name.
 */
export const GENERIC_DIR_SEGMENTS = new Set([
  "apps",
  "packages",
  "libs",
  "modules",
  "services",
  "src",
  "source",
  "app",
  "core",
  "common",
  "shared",
  "utils",
  "helpers",
  "config",
  "scripts",
  "tools",
  "internal",
  "external",
  "public",
  "private",
  "main",
  "root",
  "projects",
  "workspace",
  "monorepo",
]);

/**
 * Generic component names that frequently repeat across different repositories
 * and should always be qualified by their parent project name in the UI.
 */
export const GENERIC_COMPONENT_NAMES = new Set([
  "frontend",
  "backend",
  "client",
  "server",
  "api",
  "web",
  "ui",
  "desktop",
  "mobile",
  "app",
  "apps",
  "python",
  "service",
  "services",
  "worker",
  "admin",
  "dashboard",
  "remotion",
  "widget",
]);

export interface ProjectNamingTarget {
  name: string;
  path: string;
  relativePath?: string;
  isRoot?: boolean;
  displayName?: string;
  namespace?: string;
  hasNameCollision?: boolean;
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
 * Checks whether a package.json represents purely tooling configuration (e.g., eslint/prettier configs)
 * or auto-generated internal stubs (e.g. prisma generated client), which should not be shown as standalone projects.
 */
export function isConfigOnlyPackage(
  pkg: PackageJsonStructure,
  directoryPath: string
): boolean {
  const name = pkg.name || "";
  const scripts = (pkg as Record<string, unknown>).scripts as
    | Record<string, string>
    | undefined;

  // Prisma generated clients
  if (name.startsWith("prisma-client-") || directoryPath.includes("/generated/")) {
    return true;
  }

  // Config packages like @shopsmart/config-eslint, eslint-config-*, tsconfig-*, etc.
  const isConfigName =
    name.includes("/config-") ||
    name.includes("eslint-config") ||
    name.includes("prettier-config") ||
    name.includes("tsconfig") ||
    directoryPath.includes("/packages/config/") ||
    directoryPath.endsWith("/packages/config");

  if (isConfigName) {
    const hasRunnableScript =
      scripts &&
      Boolean(
        scripts.dev ||
          scripts.start ||
          scripts.build ||
          scripts.test ||
          scripts.serve
      );
    if (!hasRunnableScript) {
      return true;
    }
  }

  // Monorepo internal stub packages (under packages/ or libs/) with no runnable scripts
  const isMonorepoPkgDir =
    directoryPath.includes("/packages/") || directoryPath.includes("/libs/");
  const hasAppScript =
    scripts &&
    Boolean(
      scripts.dev ||
        scripts.start ||
        scripts.build ||
        scripts.test ||
        scripts.serve ||
        scripts.preview
    );
  const hasDeps =
    (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) ||
    (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0);
  const hasScripts = scripts && Object.keys(scripts).length > 0;

  if (isMonorepoPkgDir && !hasAppScript) {
    // Pure type/contract/stub declarations with empty scripts or no deps
    if (!hasScripts || !hasDeps) {
      return true;
    }
  }

  // Empty or stub package.json with no scripts and no dependencies
  if (!hasDeps && !hasScripts) {
    return true;
  }

  return false;
}

/**
 * Detects project type based on package.json dependencies and devDependencies.
 */
export function detectProjectType(
  pkg: PackageJsonStructure,
  directoryPath?: string
): ProjectType {
  const deps = pkg.dependencies ?? {};
  const devDeps = pkg.devDependencies ?? {};

  const has = (name: string): boolean =>
    Boolean(
      Object.prototype.hasOwnProperty.call(deps, name) ||
        Object.prototype.hasOwnProperty.call(devDeps, name)
    );

  // 1. AI / ML / Deep Learning / LLM packages in Node
  const aiDeps = [
    "@tensorflow/tfjs",
    "brain.js",
    "openai",
    "@langchain/core",
    "langchain",
    "@xenova/transformers",
    "onnxruntime-web",
    "onnxruntime-node",
    "@google/genai",
    "@google/generative-ai",
    "chromadb",
    "replicate",
  ];
  if (aiDeps.some((pkgName) => has(pkgName))) {
    return "AI / ML / Deep Learning";
  }

  // 2. Desktop apps
  if (has("electron") || has("electron-builder") || has("@tauri-apps/api")) {
    return "Desktop";
  }

  // 3. Mobile apps
  if (has("react-native") || has("expo")) {
    return "Mobile";
  }

  // 4. Web frameworks
  if (has("next")) {
    return "Next.js";
  }
  if (has("react") || has("react-dom")) {
    return "React";
  }
  if (has("express")) {
    return "Node.js / Express";
  }

  // 5. Monorepo internal package (inside packages/ or libs/ of a monorepo)
  if (
    directoryPath &&
    (directoryPath.includes("/packages/") || directoryPath.includes("/libs/"))
  ) {
    return "Monorepo Package";
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

    // Filter out config-only bundles or auto-generated internal stubs
    if (isConfigOnlyPackage(parsed, directoryPath)) {
      return null;
    }

    let projectName =
      typeof parsed.name === "string" && parsed.name.trim().length > 0
        ? parsed.name.trim()
        : path.basename(directoryPath);

    // If package.json has a generic directory name like "apps" or "packages", use directory name instead
    if (GENERIC_DIR_SEGMENTS.has(projectName.toLowerCase())) {
      projectName = path.basename(directoryPath);
    }

    const projectType = detectProjectType(parsed, directoryPath);
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

  // 1b. Check Browser Extension: manifest.json with manifest_version
  const manifestPath = path.join(directoryPath, "manifest.json");
  if (fsSync.existsSync(manifestPath)) {
    try {
      const manifestContent = await fs.readFile(manifestPath, "utf-8");
      const parsedManifest = JSON.parse(manifestContent);
      if (parsedManifest.manifest_version) {
        return {
          isProject: true,
          name: parsedManifest.name || path.basename(directoryPath),
          type: "Browser Extension",
          packageManager: "unknown",
        };
      }
    } catch {
      // Ignore invalid manifest
    }
  }

  // 1c. Check Desktop Tauri: src-tauri or tauri.conf.json
  if (
    fsSync.existsSync(path.join(directoryPath, "src-tauri", "Cargo.toml")) ||
    fsSync.existsSync(path.join(directoryPath, "tauri.conf.json"))
  ) {
    return {
      isProject: true,
      name: path.basename(directoryPath),
      type: "Desktop",
      packageManager: "cargo",
    };
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

  // 4. Python ecosystem (pyproject.toml, requirements.txt, Pipfile, setup.py, environment.yml)
  const pyprojectPath = path.join(directoryPath, "pyproject.toml");
  const reqsPath = path.join(directoryPath, "requirements.txt");
  const pipfilePath = path.join(directoryPath, "Pipfile");
  const setupPyPath = path.join(directoryPath, "setup.py");
  const envYmlPath = path.join(directoryPath, "environment.yml");

  if (
    fsSync.existsSync(pyprojectPath) ||
    fsSync.existsSync(reqsPath) ||
    fsSync.existsSync(pipfilePath) ||
    fsSync.existsSync(setupPyPath) ||
    fsSync.existsSync(envYmlPath)
  ) {
    let name = path.basename(directoryPath);
    let pm: PackageManager = "pip";

    if (fsSync.existsSync(pipfilePath)) {
      pm = "pipenv";
    } else if (fsSync.existsSync(path.join(directoryPath, "poetry.lock"))) {
      pm = "poetry";
    }

    let combinedText = "";
    for (const f of [reqsPath, pyprojectPath, pipfilePath, setupPyPath, envYmlPath]) {
      try {
        if (fsSync.existsSync(f)) {
          combinedText += " " + (await fs.readFile(f, "utf-8"));
        }
      } catch {}
    }

    if (fsSync.existsSync(pyprojectPath)) {
      try {
        const nameMatch = combinedText.match(/name\s*=\s*"([^"]+)"/);
        if (nameMatch && nameMatch[1]) {
          name = nameMatch[1].trim();
        }
      } catch {
        // Fallback
      }
    }

    // Determine type: AI / ML / Deep Learning vs Web Framework vs Python
    let type: ProjectType = "Python";

    const hasDeepLearning = /\b(torch|pytorch|tensorflow|keras|jax|flax|onnx|tensorrt|cuda|diffusers|transformers)\b/i.test(combinedText);
    const hasMLDataScience = /\b(scikit-learn|sklearn|xgboost|lightgbm|catboost|pandas|numpy|scipy|matplotlib|seaborn|jupyter|ipykernel|polars|optuna|langchain|llamaindex|openai|anthropic|chromadb|pinecone|weaviate|qdrant|vllm|ollama)\b/i.test(combinedText);
    const hasNotebooks = fsSync.existsSync(path.join(directoryPath, "notebooks")) || fsSync.existsSync(path.join(directoryPath, "nootbooks"));

    if (hasDeepLearning || hasMLDataScience || hasNotebooks) {
      type = "AI / ML / Deep Learning";
    } else if (/\bfastapi\b/i.test(combinedText)) {
      type = "Python / FastAPI";
    } else if (/\bdjango\b/i.test(combinedText)) {
      type = "Python / Django";
    } else if (/\bflask\b/i.test(combinedText)) {
      type = "Python / Flask";
    }

    return {
      isProject: true,
      name,
      type,
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
      let shouldRecurse = false;
      if (current.depth + 1 < maxDepth) {
        if (current.depth === 0) {
          // At workspace root level: inspect children
          shouldRecurse = true;
        } else if (!marker && !gitInfo.isGitRepo) {
          // If this directory is not a standalone project itself (e.g. org/dept, contest/, Kaggle-Hackathons/), recurse
          shouldRecurse = true;
        } else {
          // This directory IS already a detected project or repo.
          // Only recurse into recognized multi-app / subproject container directories:
          const SUBPROJECT_CONTAINERS = new Set([
            "apps",
            "packages",
            "services",
            "libs",
            "modules",
            "frontend",
            "backend",
            "client",
            "server",
            "desktop",
            "python",
          ]);
          const childHasGit = fsSync.existsSync(path.join(childPath, ".git"));
          if (childHasGit || SUBPROJECT_CONTAINERS.has(entry.name.toLowerCase())) {
            shouldRecurse = true;
          }
        }
      }

      if (shouldRecurse) {
        queue.push({
          dirPath: childPath,
          depth: current.depth + 1,
        });
      }
    }
  }

  // 3. Post-processing: Detect Fullstack projects
  for (const proj of discoveredProjects) {
    if (proj.type === "Fullstack") continue;

    // Check if project has child projects containing both a frontend and a backend
    const childProjects = discoveredProjects.filter(
      (other) => other.path !== proj.path && other.path.startsWith(proj.path + "/")
    );

    const hasFrontendChild = childProjects.some(
      (cp) =>
        cp.name.toLowerCase() === "frontend" ||
        cp.name.toLowerCase() === "client" ||
        cp.name.toLowerCase() === "web" ||
        cp.name.toLowerCase() === "ui" ||
        cp.relativePath?.toLowerCase().includes("/frontend") ||
        cp.relativePath?.toLowerCase().includes("/client") ||
        cp.relativePath?.toLowerCase().includes("/web") ||
        cp.type === "Next.js" ||
        cp.type === "React"
    );

    const hasBackendChild = childProjects.some(
      (cp) =>
        cp.name.toLowerCase() === "backend" ||
        cp.name.toLowerCase() === "server" ||
        cp.name.toLowerCase() === "api" ||
        cp.relativePath?.toLowerCase().includes("/backend") ||
        cp.relativePath?.toLowerCase().includes("/server") ||
        cp.relativePath?.toLowerCase().includes("/api") ||
        cp.type === "Node.js / Express" ||
        cp.type === "Python" ||
        cp.type.startsWith("Python")
    );

    if (hasFrontendChild && hasBackendChild) {
      proj.type = "Fullstack";
    }
  }

  // 4. Advanced Smart Naming: resolve displayName + namespace to fix name collisions
  resolveDisplayNames(discoveredProjects, resolvedRoot);

  // Sort: workspace root first if present, then alphabetical by relativePath
  return discoveredProjects.sort((a, b) => {
    if (a.isRoot && !b.isRoot) return -1;
    if (!a.isRoot && b.isRoot) return 1;
    const aPath = a.relativePath || a.name;
    const bPath = b.relativePath || b.name;
    return aPath.localeCompare(bPath);
  });
}

// ---------------------------------------------------------------------------
// Smart Naming Engine
// ---------------------------------------------------------------------------

/**
 * Resolves `displayName`, `namespace`, and `hasNameCollision` for all projects.
 * Supports both DiscoveredProject and SavedProject.
 *
 * Rules:
 * 1. Collisions: Any projects sharing the same raw name (case-insensitive) are marked hasNameCollision = true.
 * 2. Nested Subprojects: If a project is nested (e.g. "Auto_Upload/frontend", "Consistify/apps/backend",
 *    "campus_connect/frontend", "Verbatix/apps/desktop", "Verbatix/python"):
 *    - Finds meaningful parent project namespace (skipping generic container dirs like "apps", "packages", "src").
 *    - If subproject raw name equals namespace or is "apps", normalizes it to directory basename (e.g. "frontend", "backend").
 *    - Sets namespace = parent namespace (e.g. "Auto_Upload", "Consistify", "Verbatix").
 *    - Sets displayName = `${namespace} › ${componentName}` (e.g. "Auto_Upload › frontend").
 * 3. Colliding Top-Level Projects:
 *    - If top-level projects share a name (e.g. "Boiler_Code" and "Krafty_Portfolio" both named "Portfolio_Santoshi"):
 *      Sets displayName = `${name} (${folderName})` and namespace = folderName.
 * 4. Generic Component Names:
 *    - Projects named "frontend", "backend", "desktop", "python", "client", "server", etc. are always qualified with their namespace.
 * 5. Global Uniqueness Guarantee:
 *    - If any displayNames still collide, appends relativePath to guarantee 100% unique labels.
 */
export function resolveDisplayNames<T extends ProjectNamingTarget>(
  projects: T[],
  workspaceRoot: string
): void {
  if (!projects || projects.length === 0) return;

  // 1. Group projects by raw name (case-insensitive) to identify name collisions
  const byName = new Map<string, T[]>();
  for (const proj of projects) {
    const key = (proj.name || "").trim().toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      existing.push(proj);
    } else {
      byName.set(key, [proj]);
    }
  }

  for (const group of byName.values()) {
    if (group.length > 1) {
      for (const proj of group) {
        proj.hasNameCollision = true;
      }
    } else {
      group[0].hasNameCollision = false;
    }
  }

  // 2. Resolve namespace and displayName for each project
  for (const proj of projects) {
    let rel = (proj.relativePath ?? "").replace(/\\/g, "/").trim();
    if (!rel && proj.path && workspaceRoot) {
      try {
        rel = path.relative(workspaceRoot, proj.path).replace(/\\/g, "/");
      } catch {
        rel = "";
      }
    }

    // Case A: Workspace root project
    if (proj.isRoot || rel === "." || rel === "") {
      proj.namespace = undefined;
      proj.displayName = proj.name;
      continue;
    }

    const parts = rel.split("/").filter(Boolean);

    // Case B: Direct top-level folder in workspace root (e.g. "Auto_Upload", "Semester_5_AML_DL")
    if (parts.length <= 1) {
      const folderName = parts[0] || proj.name;
      if (proj.hasNameCollision && folderName.toLowerCase() !== proj.name.toLowerCase()) {
        // e.g. Boiler_Code vs Krafty_Portfolio both named Portfolio_Santoshi in package.json
        proj.namespace = folderName;
        proj.displayName = `${proj.name} (${folderName})`;
      } else {
        proj.namespace = undefined;
        proj.displayName = proj.name;
      }
      continue;
    }

    // Case C: Nested subprojects (e.g. "Auto_Upload/frontend", "Consistify/apps/backend", "Verbatix/apps/desktop")
    const ownDir = parts[parts.length - 1];
    const ancestors = parts.slice(0, parts.length - 1);

    // Collect non-generic ancestors in order (e.g. ["shorts-factory", "ClipPilot"] from "shorts-factory/packages/ClipPilot/remotion_explainer")
    const meaningful: string[] = [];
    for (const seg of ancestors) {
      if (!GENERIC_DIR_SEGMENTS.has(seg.toLowerCase())) {
        meaningful.push(seg);
      }
    }

    const namespace = meaningful.length > 0 ? meaningful.join(" › ") : ancestors[ancestors.length - 1];

    // Normalize project name if it was generic or duplicated the parent name
    let componentName = proj.name;
    if (
      proj.name.toLowerCase() === namespace.toLowerCase() ||
      proj.name.toLowerCase() === "apps" ||
      proj.name.toLowerCase() === "packages"
    ) {
      componentName = ownDir;
      proj.name = ownDir;
    }

    proj.namespace = namespace;
    proj.displayName = `${namespace} › ${componentName}`;
  }

  // 3. Post-pass: ensure all displayNames are unique across the workspace
  const displayCounts = new Map<string, number>();
  for (const proj of projects) {
    const key = (proj.displayName || proj.name).toLowerCase();
    displayCounts.set(key, (displayCounts.get(key) || 0) + 1);
  }

  for (const proj of projects) {
    const key = (proj.displayName || proj.name).toLowerCase();
    if ((displayCounts.get(key) || 0) > 1) {
      const rel = (proj.relativePath ?? "").replace(/\\/g, "/");
      if (rel && rel !== ".") {
        proj.displayName = `${proj.displayName || proj.name} (${rel})`;
      }
    }
  }
}
