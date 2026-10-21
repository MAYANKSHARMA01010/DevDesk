import Database, { Database as DatabaseType } from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

let dbInstance: DatabaseType | null = null;

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
 * Initializes the SQLite database and executes migrations/table setup.
 */
export function initializeDatabase(): DatabaseType {
  if (dbInstance) {
    return dbInstance;
  }

  const dataDir = getDataDirectory();

  // Create data directory if it doesn't already exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = getDatabasePath();
  const db = new Database(dbPath);

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
      type TEXT NOT NULL,
      package_manager TEXT NOT NULL,
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

  dbInstance = db;
  return dbInstance;
}

/**
 * Returns the active database instance, initializing it if needed.
 */
export function getDatabase(): DatabaseType {
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
