import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { workspaceRepository } from "../workspaces/workspaceRepository.js";
import { SavedProject } from "../../types/workspace.js";
import {
  GitBranchesResult,
  GitCommitItem,
  GitCommitResult,
  GitDiffResult,
  GitFileChange,
  GitFileStatusType,
  GitHistoryResult,
  GitPullResult,
  GitPushResult,
  GitStatusResult,
} from "../../types/git.js";

interface GitCommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Executes a Git binary with discrete arguments, strict timeout, and bounded output.
 * Never uses shell: true.
 */
export function runGitCommand(
  cwd: string,
  args: string[],
  timeoutMs: number = 8000
): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    try {
      const child = spawn("git", args, {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      const MAX_BUFFER = 5 * 1024 * 1024; // 5MB buffer limit
      let finished = false;

      child.stdout.on("data", (chunk: Buffer) => {
        if (stdout.length < MAX_BUFFER) {
          stdout += chunk.toString("utf-8");
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < MAX_BUFFER) {
          stderr += chunk.toString("utf-8");
        }
      });

      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          try {
            child.kill("SIGKILL");
          } catch {
            // ignore
          }
          resolve({
            stdout,
            stderr: `Git command timed out after ${timeoutMs}ms`,
            code: -1,
          });
        }
      }, timeoutMs);

      child.on("close", (code) => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          resolve({ stdout, stderr, code });
        }
      });

      child.on("error", (err: NodeJS.ErrnoException) => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          if (err.code === "ENOENT") {
            resolve({
              stdout: "",
              stderr: "Git is not installed or not found in system PATH",
              code: 127,
            });
          } else {
            resolve({ stdout: "", stderr: err.message, code: -1 });
          }
        }
      });
    } catch (err: unknown) {
      const error = err as Error;
      resolve({ stdout: "", stderr: error.message, code: -1 });
    }
  });
}

/**
 * Validates that a file path is safely relative to repositoryRoot,
 * rejecting absolute paths and traversal attempts outside the repo.
 */
export function validateRelativeRepoPath(
  filePath: string,
  repositoryRoot: string
): string {
  if (
    !filePath ||
    typeof filePath !== "string" ||
    filePath.trim().length === 0
  ) {
    throw new Error("File path is required and cannot be empty");
  }

  const trimmed = filePath.trim();

  // Reject absolute paths
  if (path.isAbsolute(trimmed)) {
    throw new Error(`Absolute paths are not allowed: "${filePath}"`);
  }

  const resolved = path.resolve(repositoryRoot, trimmed);
  const relative = path.relative(repositoryRoot, resolved);

  // Reject traversal outside repository root
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `Path traversal outside repository is not allowed: "${filePath}"`
    );
  }

  return relative.split(path.sep).join("/");
}

/**
 * Resolves a saved project by ID from SQLite and determines its actual Git repository root.
 */
export async function resolveProjectRepository(projectId: string): Promise<{
  project: SavedProject;
  repositoryRoot: string;
}> {
  if (
    !projectId ||
    typeof projectId !== "string" ||
    projectId.trim().length === 0
  ) {
    throw new Error("Project ID is required");
  }

  const project = workspaceRepository.getProjectById(projectId.trim());
  if (!project) {
    throw new Error(`Project with ID "${projectId}" not found in database`);
  }

  if (!fs.existsSync(project.path)) {
    throw new Error(
      `Project directory does not exist on disk: "${project.path}"`
    );
  }

  // Determine the actual repository root (works for projects inside monorepos or subdirectories)
  const revParse = await runGitCommand(project.path, [
    "rev-parse",
    "--show-toplevel",
  ]);

  if (revParse.code !== 0) {
    if (
      revParse.stderr.includes("not found in system PATH") ||
      revParse.code === 127
    ) {
      throw new Error("Git is not installed or not available in system PATH");
    }
    throw new Error(
      `Project "${project.name}" is not inside a Git repository: "${project.path}"`
    );
  }

  const repositoryRoot = revParse.stdout.trim();
  if (!repositoryRoot || !fs.existsSync(repositoryRoot)) {
    throw new Error(
      `Failed to resolve a valid Git repository root for project "${project.name}"`
    );
  }

  function toRealPath(p: string): string {
    try {
      return fs.realpathSync(path.resolve(p));
    } catch {
      return path.resolve(p);
    }
  }

  // Ensure Git operations target the selected project/repository and not the parent by mistake
  const resolvedProjectPath = toRealPath(project.path);
  const resolvedRepoRoot = toRealPath(repositoryRoot);

  const workspace = workspaceRepository.getById(project.workspaceId);
  if (workspace) {
    const resolvedWorkspaceRoot = toRealPath(workspace.rootPath);
    if (
      resolvedProjectPath !== resolvedWorkspaceRoot &&
      resolvedRepoRoot === resolvedWorkspaceRoot &&
      !project.isRoot &&
      !fs.existsSync(path.join(project.path, ".git"))
    ) {
      const rootProjectExists = workspace.projects.some(
        (p) => p.isRoot || toRealPath(p.path) === resolvedWorkspaceRoot
      );
      if (rootProjectExists) {
        throw new Error(
          `Project "${project.name}" is not an independent Git repository (it is inside parent repository "${path.basename(resolvedWorkspaceRoot)}"). To manage that repository, select the workspace root project.`
        );
      }
    }
  }

  return { project, repositoryRoot: resolvedRepoRoot };
}

/**
 * Converts a porcelain status character code to a user-friendly GitFileStatusType.
 */
function mapStatusCode(code: string): GitFileStatusType {
  switch (code) {
    case "M":
      return "modified";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "?":
      return "untracked";
    case "!":
      return "ignored";
    case "u":
      return "unmerged";
    case ".":
    default:
      return "clean";
  }
}

export class GitService {
  /**
   * Retrieves comprehensive repository status using Git porcelain v2 format.
   */
  public async getStatus(projectId: string): Promise<GitStatusResult> {
    const { project, repositoryRoot } = await resolveProjectRepository(
      projectId
    );

    const statusResult = await runGitCommand(repositoryRoot, [
      "status",
      "--porcelain=v2",
      "--branch",
      "-uall",
    ]);

    if (statusResult.code !== 0) {
      throw new Error(
        `Failed to retrieve Git status: ${statusResult.stderr.trim()}`
      );
    }

    let currentBranch: string | null = null;
    let isDetached = false;
    let hasCommits = true;
    let upstream: string | null = null;
    let ahead = 0;
    let behind = 0;

    const files: GitFileChange[] = [];

    const lines = statusResult.stdout.split("\n");

    for (const line of lines) {
      if (!line) continue;

      // Parse branch metadata lines
      if (line.startsWith("# branch.")) {
        if (line.startsWith("# branch.oid ")) {
          const oid = line.substring(13).trim();
          if (oid === "(initial)") {
            hasCommits = false;
          }
        } else if (line.startsWith("# branch.head ")) {
          const head = line.substring(14).trim();
          if (head === "(detached)") {
            isDetached = true;
            currentBranch = "HEAD (detached)";
          } else if (head !== "(initial)") {
            currentBranch = head;
          }
        } else if (line.startsWith("# branch.upstream ")) {
          upstream = line.substring(18).trim() || null;
        } else if (line.startsWith("# branch.ab ")) {
          const abParts = line.substring(12).trim().split(/\s+/);
          for (const part of abParts) {
            if (part.startsWith("+")) {
              ahead = parseInt(part.substring(1), 10) || 0;
            } else if (part.startsWith("-")) {
              behind = parseInt(part.substring(1), 10) || 0;
            }
          }
        }
        continue;
      }

      // Parse changed tracked files (Type 1)
      // Format: 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
      if (line.startsWith("1 ")) {
        const parts = line.split(" ");
        if (parts.length >= 9) {
          const xy = parts[1];
          const x = xy[0];
          const y = xy[1];
          const filePath = parts.slice(8).join(" ");

          const staged = x !== ".";
          const unstaged = y !== ".";

          files.push({
            path: filePath,
            staged,
            unstaged,
            indexStatus: mapStatusCode(x),
            workingTreeStatus: mapStatusCode(y),
          });
        }
        continue;
      }

      // Parse renamed / copied files (Type 2)
      // Format: 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><TAB><origPath>
      if (line.startsWith("2 ")) {
        const tabIndex = line.indexOf("\t");
        if (tabIndex !== -1) {
          const beforeTab = line.substring(0, tabIndex);
          const origPath = line.substring(tabIndex + 1);
          const parts = beforeTab.split(" ");
          if (parts.length >= 10) {
            const xy = parts[1];
            const x = xy[0];
            const y = xy[1];
            const filePath = parts.slice(9).join(" ");

            const staged = x !== ".";
            const unstaged = y !== ".";

            files.push({
              path: filePath,
              originalPath: origPath,
              staged,
              unstaged,
              indexStatus: mapStatusCode(x),
              workingTreeStatus: mapStatusCode(y),
            });
          }
        }
        continue;
      }

      // Parse untracked files (?)
      // Format: ? <path>
      if (line.startsWith("? ")) {
        const filePath = line.substring(2);
        files.push({
          path: filePath,
          staged: false,
          unstaged: true,
          indexStatus: "clean",
          workingTreeStatus: "untracked",
        });
        continue;
      }

      // Parse unmerged files (u)
      // Format: u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
      if (line.startsWith("u ")) {
        const parts = line.split(" ");
        if (parts.length >= 11) {
          const xy = parts[1];
          const filePath = parts.slice(10).join(" ");
          files.push({
            path: filePath,
            staged: true,
            unstaged: true,
            indexStatus: "unmerged",
            workingTreeStatus: "unmerged",
          });
        }
      }
    }

    const stagedFiles = files.filter((f) => f.staged);
    const unstagedFiles = files.filter(
      (f) => f.unstaged && f.workingTreeStatus !== "untracked"
    );
    const untrackedFiles = files.filter(
      (f) => f.workingTreeStatus === "untracked"
    );

    return {
      projectId: project.id,
      projectName: project.displayName || project.name,
      projectPath: project.path,
      repositoryRoot,
      currentBranch,
      isClean: files.length === 0,
      isDetached,
      hasCommits,
      ahead,
      behind,
      upstream,
      files,
      stagedFiles,
      unstagedFiles,
      untrackedFiles,
    };
  }

  /**
   * Retrieves local and remote branches.
   */
  public async getBranches(projectId: string): Promise<GitBranchesResult> {
    const { repositoryRoot } = await resolveProjectRepository(projectId);

    // List local branches with HEAD indicator: "%(refname:short)%00%(HEAD)"
    const localResult = await runGitCommand(repositoryRoot, [
      "branch",
      "--list",
      '--format=%(refname:short)%00%(HEAD)',
    ]);

    let currentBranch: string | null = null;
    let isDetached = false;
    const localBranches: string[] = [];

    if (localResult.code === 0 && localResult.stdout.trim().length > 0) {
      const lines = localResult.stdout.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        const [branchName, headIndicator] = line.split("\0");
        if (branchName) {
          localBranches.push(branchName);
          if (headIndicator === "*") {
            currentBranch = branchName;
          }
        }
      }
    }

    // Check if detached HEAD
    if (!currentBranch) {
      const headCheck = await runGitCommand(repositoryRoot, [
        "symbolic-ref",
        "--short",
        "-q",
        "HEAD",
      ]);
      if (headCheck.code === 0 && headCheck.stdout.trim()) {
        currentBranch = headCheck.stdout.trim();
      } else {
        // Detached HEAD or unborn
        const revCheck = await runGitCommand(repositoryRoot, [
          "rev-parse",
          "--short",
          "HEAD",
        ]);
        if (revCheck.code === 0 && revCheck.stdout.trim()) {
          currentBranch = `HEAD (${revCheck.stdout.trim()})`;
          isDetached = true;
        } else {
          currentBranch = null; // Unborn branch with no commits
        }
      }
    }

    // List remote branches
    const remoteResult = await runGitCommand(repositoryRoot, [
      "branch",
      "-r",
      "--list",
      '--format=%(refname:short)',
    ]);

    const remoteBranches: string[] = [];
    if (remoteResult.code === 0 && remoteResult.stdout.trim().length > 0) {
      const lines = remoteResult.stdout.split("\n");
      for (const line of lines) {
        const clean = line.trim();
        // Ignore symbolic HEAD pointers like origin/HEAD
        if (clean && !clean.includes("/HEAD")) {
          remoteBranches.push(clean);
        }
      }
    }

    return {
      currentBranch,
      isDetached,
      localBranches: Array.from(new Set(localBranches)),
      remoteBranches: Array.from(new Set(remoteBranches)),
    };
  }

  /**
   * Safely switches to an existing local branch.
   * Protects local modifications from being overwritten.
   */
  public async checkoutBranch(
    projectId: string,
    branchName: string
  ): Promise<{ branch: string; message: string }> {
    if (
      !branchName ||
      typeof branchName !== "string" ||
      branchName.trim().length === 0
    ) {
      throw new Error("Branch name is required and cannot be empty");
    }

    const cleanBranch = branchName.trim();

    // Reject dangerous flags and invalid branch names
    if (cleanBranch.startsWith("-") || !/^[a-zA-Z0-9_\-\.\/]+$/.test(cleanBranch)) {
      throw new Error(`Invalid branch name format: "${cleanBranch}"`);
    }

    const { repositoryRoot } = await resolveProjectRepository(projectId);

    // Verify branch exists locally
    const branches = await this.getBranches(projectId);
    if (!branches.localBranches.includes(cleanBranch)) {
      throw new Error(
        `Local branch "${cleanBranch}" does not exist. Automatic branch creation is disabled.`
      );
    }

    if (branches.currentBranch === cleanBranch) {
      return {
        branch: cleanBranch,
        message: `Already on branch "${cleanBranch}"`,
      };
    }

    // Execute checkout without force
    const checkoutResult = await runGitCommand(repositoryRoot, [
      "checkout",
      cleanBranch,
    ]);

    if (checkoutResult.code !== 0) {
      const err = checkoutResult.stderr.trim() || checkoutResult.stdout.trim();
      throw new Error(`Checkout failed: ${err}`);
    }

    return {
      branch: cleanBranch,
      message: checkoutResult.stderr.trim() || `Switched to branch "${cleanBranch}"`,
    };
  }

  /**
   * Retrieves text diff for a specific file, supporting staged and unstaged states.
   */
  public async getDiff(
    projectId: string,
    filePath: string,
    staged: boolean = false
  ): Promise<GitDiffResult> {
    const { repositoryRoot } = await resolveProjectRepository(projectId);
    const validPath = validateRelativeRepoPath(filePath, repositoryRoot);

    // Check if the file is untracked
    const statusCheck = await runGitCommand(repositoryRoot, [
      "status",
      "--porcelain=v2",
      "--",
      validPath,
    ]);

    const isUntracked = statusCheck.stdout
      .split("\n")
      .some((l) => l.startsWith("? ") && l.substring(2) === validPath);

    let diffText = "";
    let isBinary = false;

    if (isUntracked) {
      // For untracked files, use git diff --no-index against /dev/null
      const absPath = path.join(repositoryRoot, validPath);
      if (!fs.existsSync(absPath)) {
        return {
          file: validPath,
          staged: false,
          isUntracked: true,
          isBinary: false,
          isTruncated: false,
          addedLines: 0,
          removedLines: 0,
          diff: "",
        };
      }

      // Check file size to avoid huge diffs on untracked files
      try {
        const stats = fs.statSync(absPath);
        if (stats.size > 1024 * 1024) {
          // File is > 1MB
          return {
            file: validPath,
            staged: false,
            isUntracked: true,
            isBinary: false,
            isTruncated: true,
            addedLines: 0,
            removedLines: 0,
            diff: `[DevDesk] Untracked file is too large (${(stats.size / 1024).toFixed(1)} KB) for inline diff preview.`,
          };
        }
      } catch {
        // ignore
      }

      // git diff --no-index exits with 1 when differences exist
      const diffCmd = await runGitCommand(repositoryRoot, [
        "diff",
        "--no-index",
        "--",
        "/dev/null",
        validPath,
      ]);

      diffText = diffCmd.stdout;
    } else {
      // Tracked file: query staged or unstaged diff
      const args = staged
        ? ["diff", "--cached", "--", validPath]
        : ["diff", "--", validPath];

      const diffCmd = await runGitCommand(repositoryRoot, args);
      if (diffCmd.code !== 0) {
        throw new Error(`Failed to retrieve diff: ${diffCmd.stderr.trim()}`);
      }
      diffText = diffCmd.stdout;
    }

    if (diffText.includes("Binary files differ") || diffText.includes("GIT binary patch")) {
      isBinary = true;
    }

    // Count added and removed lines
    let addedLines = 0;
    let removedLines = 0;
    const lines = diffText.split("\n");

    for (const l of lines) {
      if (l.startsWith("+") && !l.startsWith("+++")) {
        addedLines++;
      } else if (l.startsWith("-") && !l.startsWith("---")) {
        removedLines++;
      }
    }

    // Bound diff output to 3000 lines max
    const MAX_LINES = 3000;
    let isTruncated = false;
    let formattedDiff = diffText;

    if (lines.length > MAX_LINES) {
      formattedDiff =
        lines.slice(0, MAX_LINES).join("\n") +
        `\n\n[DevDesk] Output truncated: showing first ${MAX_LINES} of ${lines.length} lines.`;
      isTruncated = true;
    }

    return {
      file: validPath,
      staged,
      isUntracked,
      isBinary,
      isTruncated,
      addedLines,
      removedLines,
      diff: formattedDiff,
    };
  }

  /**
   * Stages specified files or all changes.
   */
  public async stageFiles(
    projectId: string,
    files?: string[],
    all?: boolean
  ): Promise<{ stagedCount: number; files: string[] }> {
    const { repositoryRoot } = await resolveProjectRepository(projectId);

    if (all === true) {
      const addResult = await runGitCommand(repositoryRoot, ["add", "-A", "--", "."]);
      if (addResult.code !== 0) {
        throw new Error(`Failed to stage all files: ${addResult.stderr.trim()}`);
      }
      const updatedStatus = await this.getStatus(projectId);
      return {
        stagedCount: updatedStatus.stagedFiles.length,
        files: updatedStatus.stagedFiles.map((f) => f.path),
      };
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error("Must provide an array of file paths or specify all: true");
    }

    const validatedPaths: string[] = files.map((f) =>
      validateRelativeRepoPath(f, repositoryRoot)
    );

    const addResult = await runGitCommand(repositoryRoot, [
      "add",
      "--",
      ...validatedPaths,
    ]);

    if (addResult.code !== 0) {
      throw new Error(`Failed to stage files: ${addResult.stderr.trim()}`);
    }

    return {
      stagedCount: validatedPaths.length,
      files: validatedPaths,
    };
  }

  /**
   * Unstages specified files or all changes without modifying working-tree files.
   */
  public async unstageFiles(
    projectId: string,
    files?: string[],
    all?: boolean
  ): Promise<{ unstagedCount: number; files: string[] }> {
    const { repositoryRoot } = await resolveProjectRepository(projectId);

    // Check if repository has commits (HEAD resolves)
    const headCheck = await runGitCommand(repositoryRoot, [
      "rev-parse",
      "--verify",
      "HEAD",
    ]);
    const hasHead = headCheck.code === 0;

    if (all === true) {
      if (hasHead) {
        // Use restore --staged (modern, does not touch working tree)
        let unstageResult = await runGitCommand(repositoryRoot, [
          "restore",
          "--staged",
          "--",
          ".",
        ]);
        if (unstageResult.code !== 0) {
          // Fallback to git reset HEAD
          unstageResult = await runGitCommand(repositoryRoot, [
            "reset",
            "HEAD",
            "--",
            ".",
          ]);
        }
        if (unstageResult.code !== 0) {
          throw new Error(
            `Failed to unstage all files: ${unstageResult.stderr.trim()}`
          );
        }
      } else {
        // Unborn initial branch: git rm -r --cached -- .
        const unstageResult = await runGitCommand(repositoryRoot, [
          "rm",
          "-r",
          "--cached",
          "--",
          ".",
        ]);
        if (unstageResult.code !== 0) {
          throw new Error(
            `Failed to unstage all files: ${unstageResult.stderr.trim()}`
          );
        }
      }

      return {
        unstagedCount: 0,
        files: [],
      };
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error("Must provide an array of file paths or specify all: true");
    }

    const validatedPaths: string[] = files.map((f) =>
      validateRelativeRepoPath(f, repositoryRoot)
    );

    if (hasHead) {
      let unstageResult = await runGitCommand(repositoryRoot, [
        "restore",
        "--staged",
        "--",
        ...validatedPaths,
      ]);
      if (unstageResult.code !== 0) {
        // Fallback to git reset HEAD
        unstageResult = await runGitCommand(repositoryRoot, [
          "reset",
          "HEAD",
          "--",
          ...validatedPaths,
        ]);
      }
      if (unstageResult.code !== 0) {
        throw new Error(
          `Failed to unstage files: ${unstageResult.stderr.trim()}`
        );
      }
    } else {
      // Unborn initial branch
      const unstageResult = await runGitCommand(repositoryRoot, [
        "rm",
        "--cached",
        "--",
        ...validatedPaths,
      ]);
      if (unstageResult.code !== 0) {
        throw new Error(
          `Failed to unstage files: ${unstageResult.stderr.trim()}`
        );
      }
    }

    return {
      unstagedCount: validatedPaths.length,
      files: validatedPaths,
    };
  }

  /**
   * Commits staged changes with a validated message.
   * Rejects commits when nothing is staged unless stageAll is true. Never amends.
   */
  public async commit(
    projectId: string,
    message: string,
    stageAll?: boolean
  ): Promise<GitCommitResult> {
    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      throw new Error("Commit message is required and cannot be empty");
    }

    const cleanMessage = message.trim();
    const { repositoryRoot } = await resolveProjectRepository(projectId);

    // If stageAll requested, stage all tracked and untracked changes first
    if (stageAll) {
      const stageResult = await runGitCommand(repositoryRoot, ["add", "-A"]);
      if (stageResult.code !== 0) {
        throw new Error(
          `Failed to stage changes before commit: ${
            stageResult.stderr.trim() || stageResult.stdout.trim()
          }`
        );
      }
    }

    // Verify there are staged changes: git diff --cached --quiet exits 0 if clean, 1 if staged changes exist
    const diffCheck = await runGitCommand(repositoryRoot, [
      "diff",
      "--cached",
      "--quiet",
    ]);

    if (diffCheck.code === 0) {
      throw new Error(
        "No staged changes to commit. Stage your changes before committing."
      );
    }

    // Execute commit
    const commitResult = await runGitCommand(repositoryRoot, [
      "commit",
      "-m",
      cleanMessage,
    ]);

    if (commitResult.code !== 0) {
      const err = commitResult.stderr.trim() || commitResult.stdout.trim();
      throw new Error(`Git commit failed: ${err}`);
    }

    // Retrieve new commit hash
    const hashResult = await runGitCommand(repositoryRoot, [
      "rev-parse",
      "HEAD",
    ]);

    const commitHash =
      hashResult.code === 0 ? hashResult.stdout.trim() : "unknown";

    return {
      commitHash,
      message: cleanMessage,
      summary: commitResult.stdout.trim(),
    };
  }

  /**
   * Retrieves a limited list of recent commits.
   * Handles empty repositories with no commits gracefully.
   */
  public async getHistory(
    projectId: string,
    limit: number = 20
  ): Promise<GitHistoryResult> {
    const { repositoryRoot } = await resolveProjectRepository(projectId);

    // Verify repository has commits
    const headCheck = await runGitCommand(repositoryRoot, [
      "rev-parse",
      "--verify",
      "HEAD",
    ]);

    if (headCheck.code !== 0) {
      return { commits: [], total: 0 };
    }

    const boundedLimit = Math.max(1, Math.min(limit || 20, 100));

    // Format: hash, shortHash, authorName, authorEmail, isoDate, subject
    const logResult = await runGitCommand(repositoryRoot, [
      "log",
      `-n`,
      `${boundedLimit}`,
      '--pretty=format:%H%x00%h%x00%an%x00%ae%x00%aI%x00%s',
    ]);

    if (logResult.code !== 0) {
      return { commits: [], total: 0 };
    }

    const commits: GitCommitItem[] = [];
    const lines = logResult.stdout.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split("\0");
      if (parts.length >= 6) {
        commits.push({
          hash: parts[0],
          shortHash: parts[1],
          author: parts[2],
          email: parts[3],
          date: parts[4],
          message: parts[5],
        });
      }
    }

    return {
      commits,
      total: commits.length,
    };
  }

  /**
   * Pushes current branch commits to remote repository.
   * Automatically configures upstream tracking if needed.
   */
  public async push(
    projectId: string,
    targetRemote?: string,
    targetBranch?: string,
    setUpstream?: boolean
  ): Promise<GitPushResult> {
    const { repositoryRoot } = await resolveProjectRepository(projectId);

    // Determine current branch
    const branchCmd = await runGitCommand(repositoryRoot, [
      "branch",
      "--show-current",
    ]);
    const currentBranch = branchCmd.stdout.trim() || targetBranch || "main";

    // Determine remote
    let remote = targetRemote?.trim() || "";
    if (!remote) {
      const remoteCmd = await runGitCommand(repositoryRoot, ["remote"]);
      const remotes = remoteCmd.stdout
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean);
      remote = remotes.includes("origin") ? "origin" : remotes[0] || "origin";
    }

    // Check if branch has an upstream set
    const upstreamCheck = await runGitCommand(repositoryRoot, [
      "rev-parse",
      "--abbrev-ref",
      "@{upstream}",
    ]);
    const hasUpstream =
      upstreamCheck.code === 0 && Boolean(upstreamCheck.stdout.trim());

    const branch = targetBranch?.trim() || currentBranch;
    const args: string[] = ["push"];

    if (!hasUpstream || setUpstream) {
      args.push("-u", remote, branch);
    } else if (remote && branch) {
      args.push(remote, branch);
    }

    // 45-second timeout for network transfer
    const pushResult = await runGitCommand(repositoryRoot, args, 45000);

    if (pushResult.code !== 0) {
      const err = pushResult.stderr.trim() || pushResult.stdout.trim();
      throw new Error(`Git push failed: ${err}`);
    }

    const output = (pushResult.stderr + "\n" + pushResult.stdout).trim();
    return {
      remote,
      branch,
      message: `Successfully pushed to ${remote}/${branch}`,
      summary: output,
    };
  }

  /**
   * Pulls latest commits from remote repository into current branch.
   */
  public async pull(
    projectId: string,
    targetRemote?: string,
    targetBranch?: string
  ): Promise<GitPullResult> {
    const { repositoryRoot } = await resolveProjectRepository(projectId);

    // Determine current branch
    const branchCmd = await runGitCommand(repositoryRoot, [
      "branch",
      "--show-current",
    ]);
    const currentBranch = branchCmd.stdout.trim() || targetBranch || "main";

    // Determine remote
    let remote = targetRemote?.trim() || "";
    if (!remote) {
      const remoteCmd = await runGitCommand(repositoryRoot, ["remote"]);
      const remotes = remoteCmd.stdout
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean);
      remote = remotes.includes("origin") ? "origin" : remotes[0] || "origin";
    }

    const branch = targetBranch?.trim() || currentBranch;
    const args: string[] = ["pull", remote, branch];

    // 45-second timeout for network pull
    const pullResult = await runGitCommand(repositoryRoot, args, 45000);

    if (pullResult.code !== 0) {
      const err = pullResult.stderr.trim() || pullResult.stdout.trim();
      throw new Error(`Git pull failed: ${err}`);
    }

    const output = (pullResult.stdout + "\n" + pullResult.stderr).trim();
    return {
      remote,
      branch,
      message: `Successfully pulled from ${remote}/${branch}`,
      summary: output,
    };
  }
}

export const gitService = new GitService();

