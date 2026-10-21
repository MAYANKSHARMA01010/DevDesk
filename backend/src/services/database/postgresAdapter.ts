import pg from "pg";
import {
  DatabaseColumnItem,
  DatabaseConnectionProfile,
  DatabaseQueryResult,
  DatabaseSchemaItem,
  DatabaseTableDataResult,
  DatabaseTableItem,
} from "../../types/database.js";
import { validateReadOnlySelect } from "./sqlValidator.js";

const { Client } = pg;

function sanitizeValue(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (Buffer.isBuffer(val)) {
    return `<Binary ${val.length} bytes: 0x${val.subarray(0, 16).toString("hex")}...>`;
  }
  if (typeof val === "object") {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  if (typeof val === "string" && val.length > 5000) {
    return val.slice(0, 5000) + "... (truncated)";
  }
  return val;
}

export class PostgresAdapter {
  private client: pg.Client | null = null;
  private serverVersion = "PostgreSQL";
  private connected = false;

  public isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  public getServerVersion(): string {
    return this.serverVersion;
  }

  public async connect(
    profile: DatabaseConnectionProfile,
    password?: string
  ): Promise<void> {
    if (this.isConnected()) {
      await this.disconnect();
    }

    const client = new Client({
      host: profile.host,
      port: profile.port,
      user: profile.username,
      database: profile.database,
      password: password || undefined,
      ssl: profile.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 8000,
    });

    try {
      await client.connect();

      // Get server version
      const res = await client.query("SHOW server_version");
      if (res.rows.length > 0 && res.rows[0].server_version) {
        this.serverVersion = `PostgreSQL ${res.rows[0].server_version}`;
      }

      this.client = client;
      this.connected = true;

      // Handle unexpected connection drop
      client.on("error", () => {
        this.connected = false;
        this.client = null;
      });
    } catch (err: unknown) {
      this.connected = false;
      this.client = null;
      const error = err as Error;
      throw new Error(`PostgreSQL connection failed: ${error.message}`);
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.end();
      } catch {
        // Ignore closing errors
      } finally {
        this.client = null;
        this.connected = false;
      }
    }
  }

  private ensureConnected(): pg.Client {
    if (!this.isConnected() || !this.client) {
      throw new Error("Database is not connected.");
    }
    return this.client;
  }

  public async listSchemas(): Promise<DatabaseSchemaItem[]> {
    const client = this.ensureConnected();
    const query = `
      SELECT schema_name AS name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name ASC;
    `;
    const res = await client.query(query);
    return res.rows.map((r) => ({ name: r.name }));
  }

  public async listTables(schema = "public"): Promise<DatabaseTableItem[]> {
    const client = this.ensureConnected();
    const query = `
      SELECT table_name AS name,
             table_schema AS schema,
             CASE table_type
               WHEN 'VIEW' THEN 'view'
               ELSE 'table'
             END AS type
      FROM information_schema.tables
      WHERE table_schema = $1
      ORDER BY table_name ASC;
    `;
    const res = await client.query(query, [schema]);
    return res.rows.map((r) => ({
      name: r.name,
      schema: r.schema,
      type: r.type as "table" | "view",
    }));
  }

  public async describeTable(
    table: string,
    schema = "public"
  ): Promise<DatabaseColumnItem[]> {
    const client = this.ensureConnected();
    const query = `
      SELECT c.column_name AS name,
             c.data_type AS data_type,
             (c.is_nullable = 'YES') AS is_nullable,
             c.column_default AS default_value,
             c.character_maximum_length AS max_length,
             COALESCE(pk.is_primary, false) AS is_primary_key
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.column_name, true AS is_primary
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = $1
          AND tc.table_schema = $2
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_name = $1
        AND c.table_schema = $2
      ORDER BY c.ordinal_position ASC;
    `;
    const res = await client.query(query, [table, schema]);
    return res.rows.map((r) => ({
      name: r.name,
      dataType: r.data_type,
      isNullable: Boolean(r.is_nullable),
      isPrimaryKey: Boolean(r.is_primary_key),
      defaultValue: r.default_value,
      maxLength: r.max_length ? Number(r.max_length) : null,
    }));
  }

  public async sampleTableRows(
    table: string,
    schema = "public",
    limit = 100
  ): Promise<DatabaseTableDataResult> {
    const client = this.ensureConnected();
    const boundedLimit = Math.min(Math.max(limit, 1), 500);

    // Safely quote table and schema identifiers
    const safeSchema = `"${schema.replace(/"/g, '""')}"`;
    const safeTable = `"${table.replace(/"/g, '""')}"`;

    const query = `SELECT * FROM ${safeSchema}.${safeTable} LIMIT ${boundedLimit}`;
    const res = await client.query(query);

    const columns = res.fields ? res.fields.map((f) => f.name) : [];
    const rows = res.rows.map((row) => {
      const sanitizedRow: Record<string, unknown> = {};
      for (const col of columns) {
        sanitizedRow[col] = sanitizeValue(row[col]);
      }
      return sanitizedRow;
    });

    return {
      columns,
      rows,
      totalRows: rows.length,
      truncated: rows.length === boundedLimit,
    };
  }

  public async executeQuery(
    sql: string,
    maxRows = 500
  ): Promise<DatabaseQueryResult> {
    const client = this.ensureConnected();
    const validatedSql = validateReadOnlySelect(sql, "postgres");
    const boundedLimit = Math.min(Math.max(maxRows, 1), 500);

    const startTime = Date.now();

    // Enforce read-only execution at transaction level
    try {
      await client.query("BEGIN READ ONLY;");
      await client.query("SET statement_timeout = 15000;"); // 15 seconds query timeout

      const res = await client.query(validatedSql);
      const executionTimeMs = Date.now() - startTime;

      await client.query("COMMIT;");

      const columns = res.fields ? res.fields.map((f) => f.name) : [];
      let rows = res.rows;
      let truncated = false;

      if (rows.length > boundedLimit) {
        rows = rows.slice(0, boundedLimit);
        truncated = true;
      }

      const sanitizedRows = rows.map((row) => {
        const sanitizedRow: Record<string, unknown> = {};
        for (const col of columns) {
          sanitizedRow[col] = sanitizeValue(row[col]);
        }
        return sanitizedRow;
      });

      return {
        columns,
        rows: sanitizedRows,
        rowCount: sanitizedRows.length,
        executionTimeMs,
        truncated,
      };
    } catch (err: unknown) {
      try {
        await client.query("ROLLBACK;");
      } catch {
        // ignore rollback errors
      }
      const error = err as Error;
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }
}
