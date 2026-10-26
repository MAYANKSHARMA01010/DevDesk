import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

export interface SqliteStatement<BindParameters extends unknown[] = unknown[], ResultType = any> {
  run(...params: BindParameters | unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: BindParameters | unknown[]): ResultType | undefined;
  all(...params: BindParameters | unknown[]): ResultType[];
}

export interface SqliteDatabase {
  exec(sql: string): unknown;
  pragma(pragma: string): unknown;
  prepare<BindParameters extends unknown[] = unknown[], ResultType = any>(
    sql: string
  ): SqliteStatement<BindParameters, ResultType>;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
  close(): void;
  open: boolean;
}

let dbInstance: SqliteDatabase | null = null;

/**
 * Resolves the OS-appropriate storage directory for DevDesk application data.
 * Can be overridden by the DEVDESK_DATA_DIR environment variable.
 */
export function getDataDirectory(): string {
  if (process.env.DEVDESK_DATA_DIR && process.env.DEVDESK_DATA_DIR.trim().length > 0) {
    return path.resolve(process.env.DEVDESK_DATA_DIR.trim());
  }

  const homedir = os.homedir();
  const platform = process.platform;

  if (platform === "darwin") {
    // macOS: ~/Library/Application Support/DevDesk
    return path.join(homedir, "Library", "Application Support", "DevDesk");
  } else if (platform === "win32") {
    // Windows: %APPDATA%/DevDesk
    const appData = process.env.APPDATA || path.join(homedir, "AppData", "Roaming");
    return path.join(appData, "DevDesk");
  } else {
    // Linux and others: $XDG_DATA_HOME/DevDesk or ~/.local/share/DevDesk
    const dataHome = process.env.XDG_DATA_HOME || path.join(homedir, ".local", "share");
    return path.join(dataHome, "DevDesk");
  }
}

/**
 * Returns the full path to the SQLite database file.
 */
export function getDatabasePath(): string {
  return path.join(getDataDirectory(), "devdesk.db");
}

/**
 * Creates a database instance, trying better-sqlite3 first and falling back
 * to built-in node:sqlite if native addon loading or ABI mismatches occur.
 */
function createDatabaseInstance(dbPath: string): SqliteDatabase {
  try {
    const db = new Database(dbPath);
    return db as unknown as SqliteDatabase;
  } catch (betterErr) {
    console.warn(
      "[Database] better-sqlite3 driver could not be loaded, activating node:sqlite fallback:",
      (betterErr as Error).message
    );

    const { DatabaseSync } = require("node:sqlite");
    const rawDb = new DatabaseSync(dbPath);

    return {
      exec: (sql: string) => rawDb.exec(sql),
      pragma: (sql: string) => rawDb.exec(`PRAGMA ${sql};`),
      prepare: (sql: string) => {
        const stmt = rawDb.prepare(sql);
        return {
          run: (...params: unknown[]) => stmt.run(...params),
          get: (...params: unknown[]) => stmt.get(...params),
          all: (...params: unknown[]) => stmt.all(...params),
        };
      },
      transaction: <T extends (...args: any[]) => any>(fn: T): T => {
        return ((...args: any[]) => {
          rawDb.exec("BEGIN");
          try {
            const res = fn(...args);
            rawDb.exec("COMMIT");
            return res;
          } catch (err) {
            rawDb.exec("ROLLBACK");
            throw err;
          }
        }) as T;
      },
      close: () => {
        rawDb.close();
      },
      open: true,
    };
  }
}

/**
 * Initializes the SQLite database and executes migrations/table setup.
 */
export function initializeDatabase(): SqliteDatabase {
  if (dbInstance) {
    return dbInstance;
  }

  const dataDir = getDataDirectory();

  // Create data directory if it doesn't already exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = getDatabasePath();
  const db = createDatabaseInstance(dbPath);

  // Enable foreign keys and WAL mode for reliability and performance
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      root_path TEXT UNIQUE NOT NULL,
      last_opened_at TEXT NOT NULL,
      last_scanned_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workspaces_last_opened ON workspaces(last_opened_at DESC);

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      relative_path TEXT,
      type TEXT NOT NULL,
      package_manager TEXT NOT NULL,
      is_git_repo INTEGER NOT NULL DEFAULT 0,
      git_root TEXT,
      git_remote TEXT,
      is_root INTEGER NOT NULL DEFAULT 0,
      display_name TEXT,
      namespace TEXT,
      has_name_collision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      UNIQUE(workspace_id, path)
    );

    CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id);

    CREATE TABLE IF NOT EXISTS database_connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      username TEXT NOT NULL,
      database TEXT NOT NULL,
      ssl INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_database_connections_name ON database_connections(name);
  `);

  // Safe incremental migrations for existing installations
  try {
    const projectCols = db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
    const colSet = new Set(projectCols.map((c) => c.name));

    if (!colSet.has("relative_path")) {
      db.exec("ALTER TABLE projects ADD COLUMN relative_path TEXT");
    }
    if (!colSet.has("is_git_repo")) {
      db.exec("ALTER TABLE projects ADD COLUMN is_git_repo INTEGER NOT NULL DEFAULT 0");
    }
    if (!colSet.has("git_root")) {
      db.exec("ALTER TABLE projects ADD COLUMN git_root TEXT");
    }
    if (!colSet.has("git_remote")) {
      db.exec("ALTER TABLE projects ADD COLUMN git_remote TEXT");
    }
    if (!colSet.has("is_root")) {
      db.exec("ALTER TABLE projects ADD COLUMN is_root INTEGER NOT NULL DEFAULT 0");
    }
    if (!colSet.has("display_name")) {
      db.exec("ALTER TABLE projects ADD COLUMN display_name TEXT");
    }
    if (!colSet.has("namespace")) {
      db.exec("ALTER TABLE projects ADD COLUMN namespace TEXT");
    }
    if (!colSet.has("has_name_collision")) {
      db.exec("ALTER TABLE projects ADD COLUMN has_name_collision INTEGER NOT NULL DEFAULT 0");
    }
  } catch (migErr) {
    console.error("[Database] Migration warning:", migErr);
  }

  dbInstance = db;
  return dbInstance;
}

/**
 * Returns the active database instance, initializing it if needed.
 */
export function getDatabase(): SqliteDatabase {
  if (!dbInstance) {
    return initializeDatabase();
  }
  return dbInstance;
}

/**
 * Gracefully closes the database connection.
 */
export function closeDatabase(): void {
  if (dbInstance && dbInstance.open) {
    try {
      dbInstance.close();
      dbInstance = null;
    } catch (err) {
      console.error("[Database] Error while closing SQLite database:", err);
    }
  }
}

/**
 * Completely resets the local SQLite database.
 * Closes the active database connection, removes the database and WAL files,
 * and recreates a fresh clean schema.
 */
export function resetLocalDatabase(): { success: boolean; message: string } {
  try {
    closeDatabase();
    const dbPath = getDatabasePath();
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;

    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

    // Re-initialize clean schema
    initializeDatabase();
    console.log("[Database] Local SQLite database successfully reset.");
    return { success: true, message: "Local SQLite database was successfully reset to a clean state." };
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Database] Failed to reset database:", error);
    try {
      initializeDatabase();
    } catch {}
    return { success: false, message: `Failed to reset database: ${error.message}` };
  }
}

// Graceful cleanup on process exit
process.on("exit", () => {
  closeDatabase();
});

process.on("SIGINT", () => {
  closeDatabase();
  process.exit(0);
});

process.on("SIGTERM", () => {
  closeDatabase();
  process.exit(0);
});
