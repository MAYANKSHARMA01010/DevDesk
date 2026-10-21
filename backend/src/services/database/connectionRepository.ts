import crypto from "crypto";
import { getDatabase } from "../../config/database.js";
import {
  CreateConnectionProfileInput,
  DatabaseConnectionProfile,
  DatabaseEngine,
  UpdateConnectionProfileInput,
} from "../../types/database.js";

interface ConnectionRow {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  username: string;
  database: string;
  ssl: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ConnectionRow): DatabaseConnectionProfile {
  return {
    id: row.id,
    name: row.name,
    type: row.type as DatabaseEngine,
    host: row.host,
    port: Number(row.port),
    username: row.username,
    database: row.database,
    ssl: Boolean(row.ssl),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ConnectionRepository {
  /**
   * Retrieves all saved database connection profiles.
   */
  public getAll(): DatabaseConnectionProfile[] {
    const db = getDatabase();
    const rows = db
      .prepare<[], ConnectionRow>(
        "SELECT * FROM database_connections ORDER BY updated_at DESC"
      )
      .all();

    return rows.map(mapRow);
  }

  /**
   * Retrieves a single connection profile by ID.
   */
  public getById(id: string): DatabaseConnectionProfile | null {
    const db = getDatabase();
    const row = db
      .prepare<[string], ConnectionRow>(
        "SELECT * FROM database_connections WHERE id = ?"
      )
      .get(id);

    return row ? mapRow(row) : null;
  }

  /**
   * Creates and persists a new database connection profile in SQLite.
   * NEVER stores credentials.
   */
  public create(input: CreateConnectionProfileInput): DatabaseConnectionProfile {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const row: ConnectionRow = {
      id,
      name: input.name.trim(),
      type: input.type,
      host: input.host.trim(),
      port: Number(input.port),
      username: input.username.trim(),
      database: input.database.trim(),
      ssl: input.ssl ? 1 : 0,
      created_at: now,
      updated_at: now,
    };

    db.prepare(`
      INSERT INTO database_connections (id, name, type, host, port, username, database, ssl, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id,
      row.name,
      row.type,
      row.host,
      row.port,
      row.username,
      row.database,
      row.ssl,
      row.created_at,
      row.updated_at
    );

    return mapRow(row);
  }

  /**
   * Updates an existing database connection profile.
   */
  public update(
    id: string,
    input: UpdateConnectionProfileInput
  ): DatabaseConnectionProfile {
    const existing = this.getById(id);
    if (!existing) {
      throw new Error(`Database connection profile not found: "${id}"`);
    }

    const db = getDatabase();
    const now = new Date().toISOString();

    const updated: ConnectionRow = {
      id,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      type: input.type !== undefined ? input.type : existing.type,
      host: input.host !== undefined ? input.host.trim() : existing.host,
      port: input.port !== undefined ? Number(input.port) : existing.port,
      username:
        input.username !== undefined ? input.username.trim() : existing.username,
      database:
        input.database !== undefined ? input.database.trim() : existing.database,
      ssl: input.ssl !== undefined ? (input.ssl ? 1 : 0) : (existing.ssl ? 1 : 0),
      created_at: existing.createdAt,
      updated_at: now,
    };

    db.prepare(`
      UPDATE database_connections
      SET name = ?, type = ?, host = ?, port = ?, username = ?, database = ?, ssl = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updated.name,
      updated.type,
      updated.host,
      updated.port,
      updated.username,
      updated.database,
      updated.ssl,
      updated.updated_at,
      id
    );

    return mapRow(updated);
  }

  /**
   * Deletes a database connection profile.
   */
  public delete(id: string): boolean {
    const db = getDatabase();
    const result = db
      .prepare("DELETE FROM database_connections WHERE id = ?")
      .run(id);

    return result.changes > 0;
  }
}

export const connectionRepository = new ConnectionRepository();
