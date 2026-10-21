import * as fs from "fs/promises";
import * as path from "path";
import { workspaceRepository } from "../workspaces/workspaceRepository.js";
import { ProjectScriptsResult } from "../../types/process.js";

/**
 * Discovers available runnable scripts and commands for a saved project.
 * Supports multi-ecosystem detection:
 * - Node.js (package.json scripts)
 * - Python (manage.py, app.py, main.py, requirements.txt, Pipfile)
 * - Rust (Cargo.toml: run, build, test, check)
 * - Go (go.mod, main.go: run, build, test)
 * - Makefile (all declared build/run targets)
 * - Shell scripts (*.sh)
 * - PHP/Composer (composer.json scripts)
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

  const scripts: Record<string, string> = {};

  // 1. Discover package.json scripts (npm/pnpm/yarn/bun)
  try {
    const packageJsonPath = path.join(project.path, "package.json");
    const packageJsonRaw = await fs.readFile(packageJsonPath, "utf-8");
    const parsed = JSON.parse(packageJsonRaw);
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
  } catch {
    // package.json might not exist or be invalid, continue to inspect other files
  }

  // 2. Scan directory files for other runtimes & build tools
  try {
    const dirEntries = await fs.readdir(project.path, { withFileTypes: true });
    const fileNames = new Set(dirEntries.filter((e) => e.isFile()).map((e) => e.name));

    // Python projects
    if (fileNames.has("manage.py")) {
      scripts["runserver"] = "python3 manage.py runserver";
      scripts["migrate"] = "python3 manage.py migrate";
      scripts["makemigrations"] = "python3 manage.py makemigrations";
    }
    if (fileNames.has("app.py") && !scripts["app.py"]) {
      scripts["app.py"] = "python3 app.py";
    }
    if (fileNames.has("main.py") && !scripts["main.py"]) {
      scripts["main.py"] = "python3 main.py";
    }
    if (fileNames.has("requirements.txt") && !scripts["pip:install"]) {
      scripts["pip:install"] = "pip install -r requirements.txt";
    }
    if (fileNames.has("Pipfile") && !scripts["pipenv:start"]) {
      scripts["pipenv:start"] = "pipenv run start";
    }
    if (fileNames.has("pyproject.toml") && !fileNames.has("package.json") && !scripts["poetry:run"]) {
      scripts["poetry:run"] = "poetry run";
    }

    // Rust projects (Cargo.toml)
    if (fileNames.has("Cargo.toml")) {
      if (!scripts["cargo:run"]) scripts["cargo:run"] = "cargo run";
      if (!scripts["cargo:build"]) scripts["cargo:build"] = "cargo build";
      if (!scripts["cargo:test"]) scripts["cargo:test"] = "cargo test";
      if (!scripts["cargo:check"]) scripts["cargo:check"] = "cargo check";
    }

    // Go projects (go.mod / main.go)
    if (fileNames.has("go.mod") || fileNames.has("main.go")) {
      if (!scripts["go:run"]) scripts["go:run"] = "go run .";
      if (!scripts["go:build"]) scripts["go:build"] = "go build .";
      if (!scripts["go:test"]) scripts["go:test"] = "go test ./...";
    }

    // Makefile targets
    const makefileName = fileNames.has("Makefile")
      ? "Makefile"
      : fileNames.has("makefile")
      ? "makefile"
      : null;
    if (makefileName) {
      try {
        const makefileContent = await fs.readFile(path.join(project.path, makefileName), "utf-8");
        const lines = makefileContent.split("\n");
        for (const line of lines) {
          const match = line.match(/^([a-zA-Z0-9_-]+):/);
          if (match && !match[1].startsWith(".") && match[1] !== "Makefile" && match[1] !== "makefile") {
            const target = match[1];
            scripts[`make:${target}`] = `make ${target}`;
          }
        }
      } catch {
        // ignore unreadable Makefile
      }
    }

    // Shell scripts (*.sh)
    for (const name of fileNames) {
      if (name.endsWith(".sh")) {
        scripts[`sh:${name}`] = `bash ./${name}`;
      }
    }

    // PHP / Composer projects (composer.json)
    if (fileNames.has("composer.json")) {
      try {
        const composerRaw = await fs.readFile(path.join(project.path, "composer.json"), "utf-8");
        const composerParsed = JSON.parse(composerRaw);
        if (!scripts["composer:install"]) {
          scripts["composer:install"] = "composer install";
        }
        if (
          composerParsed &&
          typeof composerParsed.scripts === "object" &&
          composerParsed.scripts !== null &&
          !Array.isArray(composerParsed.scripts)
        ) {
          for (const [name, definition] of Object.entries(composerParsed.scripts)) {
            if (typeof definition === "string") {
              scripts[`composer:${name}`] = `composer run-script ${name}`;
            }
          }
        }
      } catch {
        // ignore unreadable composer.json
      }
    }
  } catch {
    // ignore directory scan errors
  }

  return {
    projectId: project.id,
    scripts,
  };
}
