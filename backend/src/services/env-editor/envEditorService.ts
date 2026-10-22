import fs from "fs";
import path from "path";
import crypto from "crypto";
import { workspaceRepository } from "../workspaces/workspaceRepository.js";
import { SavedProject } from "../../types/workspace.js";
import {
  EnvFileContentResult,
  EnvFileLine,
  EnvFileMetadata,
  EnvFilesListResult,
  EnvFileSaveResult,
  EnvVariableEntry,
} from "../../types/envEditor.js";

export const ALLOWED_ENV_FILES: readonly string[] = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
  ".env.test",
] as const;

export const MAX_ENV_FILE_SIZE_BYTES = 256 * 1024; // 256 KB

const KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SECRET_KEY_PATTERN = /(SECRET|PASSWORD|PASS|TOKEN|API_KEY|PRIVATE_KEY|CREDENTIAL|AUTH|KEY)/i;

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityError";
  }
}

export class EnvEditorService {
  /**
   * Validates project existence in SQLite and on filesystem.
   */
  private validateProject(projectId: string): SavedProject {
    if (!projectId || typeof projectId !== "string" || !projectId.trim()) {
      throw new ValidationError("Project ID is required.");
    }

    const project = workspaceRepository.getProjectById(projectId.trim());
    if (!project) {
      throw new NotFoundError(`Project not found in database: "${projectId}".`);
    }

    if (!fs.existsSync(project.path)) {
      throw new NotFoundError(`Project directory does not exist on disk: "${project.path}".`);
    }

    const stat = fs.statSync(project.path);
    if (!stat.isDirectory()) {
      throw new ValidationError(`Project path is not a directory: "${project.path}".`);
    }

    return project;
  }

  /**
   * Resolves target environment file path within project with strict security checks.
   */
  private validateAndResolveEnvFile(
    project: SavedProject,
    filename: string
  ): { targetPath: string; exists: boolean; resolvedProjectPath: string } {
    if (!filename || typeof filename !== "string") {
      throw new ValidationError("Filename parameter is required.");
    }

    const trimmed = filename.trim();
    if (!ALLOWED_ENV_FILES.includes(trimmed as any)) {
      throw new ValidationError(
        `Unsupported environment filename: "${trimmed}". Allowed files: ${ALLOWED_ENV_FILES.join(", ")}`
      );
    }

    // Path traversal prevention: reject any slashes or parent directory navigation
    if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
      throw new SecurityError("Invalid filename: Path traversal characters are not permitted.");
    }

    const resolvedProjectPath = path.resolve(project.path);
    const targetPath = path.resolve(resolvedProjectPath, trimmed);

    // Verify directory containment
    if (path.dirname(targetPath) !== resolvedProjectPath) {
      throw new SecurityError("Security violation: Target file escapes the project directory.");
    }

    const exists = fs.existsSync(targetPath);
    if (exists) {
      // Symlink inspection: do not follow symlinks outside project directory
      const lstat = fs.lstatSync(targetPath);
      if (lstat.isSymbolicLink()) {
        const realTarget = fs.realpathSync(targetPath);
        const realProject = fs.realpathSync(resolvedProjectPath);
        if (!realTarget.startsWith(realProject + path.sep) && realTarget !== realProject) {
          throw new SecurityError(
            `Security violation: Target symlink "${trimmed}" points outside project directory.`
          );
        }
      }

      const stat = fs.statSync(targetPath);
      if (!stat.isFile()) {
        throw new ValidationError(`Target "${trimmed}" is not a regular file.`);
      }

      if (stat.size > MAX_ENV_FILE_SIZE_BYTES) {
        throw new ValidationError(
          `File "${trimmed}" size (${Math.round(stat.size / 1024)} KB) exceeds the maximum allowed limit of 256 KB.`
        );
      }
    }

    return { targetPath, exists, resolvedProjectPath };
  }

  /**
   * Scans all projects within a workspace and returns the IDs of projects
   * that contain at least one supported .env file on disk.
   */
  public async getWorkspaceProjectsWithEnv(workspaceId: string): Promise<string[]> {
    if (!workspaceId || typeof workspaceId !== "string" || !workspaceId.trim()) {
      return [];
    }

    const workspace = workspaceRepository.getById(workspaceId.trim());
    if (!workspace) return [];

    const projectIdsWithEnv: string[] = [];

    for (const project of workspace.projects) {
      if (fs.existsSync(project.path)) {
        const hasEnv = ALLOWED_ENV_FILES.some((fname) =>
          fs.existsSync(path.resolve(project.path, fname))
        );
        if (hasEnv) {
          projectIdsWithEnv.push(project.id);
        }
      }
    }

    return projectIdsWithEnv;
  }

  /**
   * Lists all supported environment files for a project without exposing variable values.
   */
  public async listEnvFiles(projectId: string): Promise<EnvFilesListResult> {
    const project = this.validateProject(projectId);

    const files: EnvFileMetadata[] = [];
    for (const fname of ALLOWED_ENV_FILES) {
      const filePath = path.resolve(project.path, fname);
      const exists = fs.existsSync(filePath);

      let isReadable = false;
      let isWritable = false;
      let sizeBytes = 0;
      let lastModified: string | null = null;
      let variableCount = 0;

      if (exists) {
        try {
          fs.accessSync(filePath, fs.constants.R_OK);
          isReadable = true;
        } catch {
          isReadable = false;
        }

        try {
          fs.accessSync(filePath, fs.constants.W_OK);
          isWritable = true;
        } catch {
          isWritable = false;
        }

        try {
          const stat = fs.statSync(filePath);
          sizeBytes = stat.size;
          lastModified = stat.mtime.toISOString();

          // Count variables safely if readable and within limit
          if (isReadable && stat.isFile() && sizeBytes <= MAX_ENV_FILE_SIZE_BYTES) {
            const content = fs.readFileSync(filePath, "utf8");
            const lines = content.split(/\r?\n/);
            for (const line of lines) {
              if (/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.test(line)) {
                variableCount++;
              }
            }
          }
        } catch {
          // Keep default safe values on stat error
        }
      }

      files.push({
        filename: fname,
        exists,
        isReadable,
        isWritable,
        sizeBytes,
        lastModified,
        variableCount,
      });
    }

    return {
      projectId: project.id,
      projectName: project.displayName || project.name,
      projectPath: project.path,
      files,
    };
  }

  /**
   * Reads and parses a supported environment file.
   */
  public async readEnvFile(
    projectId: string,
    filename: string
  ): Promise<EnvFileContentResult> {
    const project = this.validateProject(projectId);
    const { targetPath, exists } = this.validateAndResolveEnvFile(project, filename);

    if (!exists) {
      throw new NotFoundError(
        `Environment file "${filename}" does not exist in project "${project.displayName || project.name}".`
      );
    }

    try {
      fs.accessSync(targetPath, fs.constants.R_OK);
    } catch {
      throw new ValidationError(`Environment file "${filename}" is not readable (permission denied).`);
    }

    const stat = fs.statSync(targetPath);
    const rawContent = fs.readFileSync(targetPath, "utf8");

    const parsed = this.parseEnvContent(rawContent);

    return {
      projectId: project.id,
      projectName: project.displayName || project.name,
      filename,
      lastModified: stat.mtime.toISOString(),
      sizeBytes: stat.size,
      variables: parsed.variables,
      lines: parsed.lines,
      content: rawContent,
    };
  }

  /**
   * Parses raw .env content into structured lines and variables.
   */
  public parseEnvContent(content: string): {
    variables: EnvVariableEntry[];
    lines: EnvFileLine[];
  } {
    const rawLines = content.split(/\r?\n/);
    const variables: EnvVariableEntry[] = [];
    const lines: EnvFileLine[] = [];

    for (let i = 0; i < rawLines.length; i++) {
      const raw = rawLines[i];
      const trimmed = raw.trim();

      if (trimmed === "") {
        lines.push({
          type: "blank",
          line: i + 1,
          raw,
        });
        continue;
      }

      if (trimmed.startsWith("#")) {
        lines.push({
          type: "comment",
          line: i + 1,
          raw,
          comment: trimmed.replace(/^#\s*/, ""),
        });
        continue;
      }

      // Check for KEY=VALUE assignment (optional "export" prefix)
      const varMatch = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (varMatch) {
        const key = varMatch[1];
        const valPart = varMatch[2];

        let val = "";
        let comment: string | undefined = undefined;

        // Check if value is wrapped in double quotes
        const doubleQuoteMatch = valPart.match(/^"((?:[^"\\]|\\.)*)"(?:\s*#(.*))?$/);
        if (doubleQuoteMatch) {
          val = doubleQuoteMatch[1]
            .replace(/\\"/g, '"')
            .replace(/\\n/g, "\n")
            .replace(/\\\\/g, "\\");
          comment = doubleQuoteMatch[2]?.trim();
        } else {
          // Check if value is wrapped in single quotes
          const singleQuoteMatch = valPart.match(/^'([^']*)'(?:\s*#(.*))?$/);
          if (singleQuoteMatch) {
            val = singleQuoteMatch[1];
            comment = singleQuoteMatch[2]?.trim();
          } else {
            // Unquoted value: check for trailing comment separated by whitespace + #
            const hashIndex = valPart.indexOf(" #");
            if (hashIndex !== -1) {
              val = valPart.slice(0, hashIndex).trim();
              comment = valPart.slice(hashIndex + 2).trim();
            } else {
              val = valPart.trim();
            }
          }
        }

        const isSecret = SECRET_KEY_PATTERN.test(key);
        const entry: EnvVariableEntry = {
          id: `var-${i + 1}-${key}`,
          key,
          value: val,
          comment,
          isSecret,
        };

        variables.push(entry);
        lines.push({
          type: "variable",
          line: i + 1,
          raw,
          key,
          value: val,
          comment,
        });
      } else {
        // Line syntax that cannot be safely parsed as a standard variable
        lines.push({
          type: "raw",
          line: i + 1,
          raw,
        });
      }
    }

    return { variables, lines };
  }

  /**
   * Creates a supported environment file. Fails if file already exists.
   */
  public async createEnvFile(
    projectId: string,
    filename: string
  ): Promise<{ filename: string; message: string }> {
    const project = this.validateProject(projectId);
    const { targetPath, exists } = this.validateAndResolveEnvFile(project, filename);

    if (exists) {
      throw new ConflictError(
        `File "${filename}" already exists in project "${project.name}". Creating a file must not overwrite an existing file.`
      );
    }

    const initialContent = `# ${filename} - Environment variables for ${project.name}\n`;

    try {
      // Use 'wx' flag for exclusive creation
      fs.writeFileSync(targetPath, initialContent, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
    } catch (err: any) {
      if (err.code === "EEXIST") {
        throw new ConflictError(`File "${filename}" already exists.`);
      }
      throw new Error(`Failed to create file "${filename}": ${err.message}`);
    }

    return {
      filename,
      message: `Environment file "${filename}" created successfully.`,
    };
  }

  /**
   * Safely formats an environment variable value for file writing.
   */
  private formatEnvValue(value: string): string {
    if (value === "") return "";
    // If value contains spaces, quotes, newlines, hashes, or equals, quote it with escaping
    if (/[\s#"'\n\r=]/.test(value)) {
      const escaped = value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n");
      return `"${escaped}"`;
    }
    return value;
  }

  /**
   * Serializes variables into .env format while preserving comments, blank lines, and ordering.
   */
  public serializeVariablesPreservingStructure(
    originalContent: string | null,
    variables: EnvVariableEntry[]
  ): string {
    // Validate keys and check for duplicates in the new variable set
    const seenKeys = new Set<string>();
    for (const v of variables) {
      if (!KEY_REGEX.test(v.key)) {
        throw new ValidationError(
          `Invalid variable key: "${v.key}". Keys must start with a letter or underscore and contain only alphanumeric characters and underscores.`
        );
      }
      if (seenKeys.has(v.key)) {
        throw new ValidationError(`Duplicate variable key: "${v.key}". Variable keys must be unique.`);
      }
      seenKeys.add(v.key);
    }

    if (!originalContent) {
      // Simple generation
      return (
        variables
          .map((v) => {
            const commentStr = v.comment ? ` # ${v.comment}` : "";
            return `${v.key}=${this.formatEnvValue(v.value)}${commentStr}`;
          })
          .join("\n") + "\n"
      );
    }

    const rawLines = originalContent.split(/\r?\n/);
    const outputLines: string[] = [];
    const emittedKeys = new Set<string>();
    const varMap = new Map<string, EnvVariableEntry>();
    for (const v of variables) {
      varMap.set(v.key, v);
    }

    for (const raw of rawLines) {
      const trimmed = raw.trim();

      // Preserve blanks and comments as-is
      if (trimmed === "" || trimmed.startsWith("#")) {
        outputLines.push(raw);
        continue;
      }

      // Check for variable match
      const varMatch = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (varMatch) {
        const key = varMatch[1];
        if (varMap.has(key)) {
          if (!emittedKeys.has(key)) {
            const updated = varMap.get(key)!;
            const hasExport = /^\s*export\s+/.test(raw);
            const commentStr = updated.comment ? ` # ${updated.comment}` : "";
            outputLines.push(
              `${hasExport ? "export " : ""}${updated.key}=${this.formatEnvValue(updated.value)}${commentStr}`
            );
            emittedKeys.add(key);
          }
        }
        // If not in varMap, variable was removed; omit this line
        continue;
      }

      // Preserve any raw unparseable lines as-is
      outputLines.push(raw);
    }

    // Append newly added variables at the bottom
    const newVars = variables.filter((v) => !emittedKeys.has(v.key));
    if (newVars.length > 0) {
      if (outputLines.length > 0 && outputLines[outputLines.length - 1].trim() !== "") {
        outputLines.push("");
      }
      for (const v of newVars) {
        const commentStr = v.comment ? ` # ${v.comment}` : "";
        outputLines.push(`${v.key}=${this.formatEnvValue(v.value)}${commentStr}`);
      }
    }

    return outputLines.join("\n") + (outputLines.length > 0 ? "\n" : "");
  }

  /**
   * Safely saves content to an environment file with validation, conflict check, backup, and atomic write.
   */
  public async saveEnvFile(
    projectId: string,
    filename: string,
    options: {
      content?: string;
      variables?: EnvVariableEntry[];
      expectedLastModified?: string | null;
    }
  ): Promise<EnvFileSaveResult> {
    const project = this.validateProject(projectId);
    const { targetPath, exists, resolvedProjectPath } = this.validateAndResolveEnvFile(
      project,
      filename
    );

    let finalContent = "";

    if (typeof options.content === "string") {
      finalContent = options.content;
      // Validate all variable keys present in raw content
      const lines = finalContent.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === "" || line.startsWith("#")) continue;
        const match = line.match(/^\s*(?:export\s+)?([^=\s]+)\s*=/);
        if (match) {
          const key = match[1];
          if (!KEY_REGEX.test(key)) {
            throw new ValidationError(
              `Invalid variable key format on line ${i + 1}: "${key}". Keys must start with a letter or underscore and contain only alphanumeric characters and underscores.`
            );
          }
        }
      }
    } else if (Array.isArray(options.variables)) {
      const originalContent = exists ? fs.readFileSync(targetPath, "utf8") : null;
      finalContent = this.serializeVariablesPreservingStructure(
        originalContent,
        options.variables
      );
    } else {
      throw new ValidationError("Save request must provide either 'content' or 'variables'.");
    }

    // Check size limit on generated content
    const contentBytes = Buffer.byteLength(finalContent, "utf8");
    if (contentBytes > MAX_ENV_FILE_SIZE_BYTES) {
      throw new ValidationError(
        `Content size (${Math.round(contentBytes / 1024)} KB) exceeds the maximum allowed limit of 256 KB.`
      );
    }

    // Conflict detection if file exists and expectedLastModified was provided
    if (exists && options.expectedLastModified) {
      const currentStat = fs.statSync(targetPath);
      const currentIso = currentStat.mtime.toISOString();
      if (currentIso !== options.expectedLastModified) {
        throw new ConflictError(
          `Conflict detected: "${filename}" has been modified externally since it was loaded (current timestamp: ${currentIso}, editor loaded timestamp: ${options.expectedLastModified}). Please reload the file to review changes before overwriting.`
        );
      }
    }

    // Check writability if file exists
    if (exists) {
      try {
        fs.accessSync(targetPath, fs.constants.W_OK);
      } catch {
        throw new ValidationError(`Environment file "${filename}" is read-only (permission denied).`);
      }
    }

    // Create backup before overwriting existing file
    let backupCreated: string | undefined = undefined;
    if (exists) {
      const backupFilename = `${filename}.devdesk-bak`;
      const backupPath = path.resolve(resolvedProjectPath, backupFilename);
      try {
        fs.copyFileSync(targetPath, backupPath);
        backupCreated = backupFilename;
      } catch (backupErr: any) {
        throw new Error(
          `Failed to create safety backup "${backupFilename}" before saving: ${backupErr.message}`
        );
      }
    }

    // Safe atomic write via temporary file in same directory
    const tempFilename = `.${filename}.tmp.${crypto.randomUUID()}`;
    const tempPath = path.resolve(resolvedProjectPath, tempFilename);

    try {
      fs.writeFileSync(tempPath, finalContent, {
        encoding: "utf8",
        mode: 0o600,
      });
      fs.renameSync(tempPath, targetPath);
    } catch (writeErr: any) {
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // ignore cleanup error
        }
      }
      throw new Error(`Failed to atomically save file "${filename}": ${writeErr.message}`);
    }

    const updatedStat = fs.statSync(targetPath);
    const parsed = this.parseEnvContent(finalContent);

    return {
      filename,
      lastModified: updatedStat.mtime.toISOString(),
      sizeBytes: updatedStat.size,
      variableCount: parsed.variables.length,
      backupCreated,
      message: `Environment file "${filename}" saved successfully.`,
    };
  }
}

export const envEditorService = new EnvEditorService();
