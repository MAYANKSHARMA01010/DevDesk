import mysql from "mysql2/promise";
import {
  DatabaseColumnItem,
  DatabaseConnectionProfile,
  DatabaseQueryResult,
  DatabaseSchemaItem,
  DatabaseTableDataResult,
  DatabaseTableItem,
} from "../../types/database.js";
import { validateReadOnlySelect } from "./sqlValidator.js";

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

export class MysqlAdapter {
  private connection: mysql.Connection | null = null;
  private serverVersion = "MySQL";
  private connected = false;

  public isConnected(): boolean {
    return this.connected && this.connection !== null;
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

    try {
      const conn = await mysql.createConnection({
        host: profile.host,
        port: profile.port,
        user: profile.username,
        database: profile.database,
        password: password || undefined,
        ssl: profile.ssl ? { rejectUnauthorized: false } : undefined,
        connectTimeout: 8000,
      });

      // Get server version
      const [rows] = await conn.query("SELECT VERSION() AS version;");
      if (Array.isArray(rows) && rows.length > 0) {
        const v = (rows[0] as any).version;
        if (v) {
          this.serverVersion = `MySQL ${v}`;
        }
      }

      this.connection = conn;
      this.connected = true;

      // Handle unexpected connection drops
      conn.on("error", () => {
        this.connected = false;
        this.connection = null;
      });
    } catch (err: unknown) {
      this.connected = false;
      this.connection = null;
      const error = err as Error;
      throw new Error(`MySQL connection failed: ${error.message}`);
    }
  }

  public async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.end();
      } catch {
        // Ignore closing error
      } finally {
        this.connection = null;
        this.connected = false;
      }
    }
  }

  private ensureConnected(): mysql.Connection {
    if (!this.isConnected() || !this.connection) {
      throw new Error("Database is not connected.");
    }
    return this.connection;
  }

  public async listSchemas(): Promise<DatabaseSchemaItem[]> {
    const conn = this.ensureConnected();
    const query = `
      SELECT schema_name AS name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
      ORDER BY schema_name ASC;
    `;
    const [rows] = await conn.query(query);
    return (rows as any[]).map((r) => ({ name: r.name }));
  }

  public async listTables(schema?: string): Promise<DatabaseTableItem[]> {
    const conn = this.ensureConnected();
    const targetSchema = schema || "";
    const query = `
      SELECT table_name AS name,
             table_schema AS \`schema\`,
             CASE table_type
               WHEN 'VIEW' THEN 'view'
               ELSE 'table'
             END AS type
      FROM information_schema.tables
      WHERE table_schema = ?
      ORDER BY table_name ASC;
    `;
    const [rows] = await conn.query(query, [targetSchema]);
    return (rows as any[]).map((r) => ({
      name: r.name,
      schema: r.schema,
      type: r.type as "table" | "view",
    }));
  }

  public async describeTable(
    table: string,
    schema?: string
  ): Promise<DatabaseColumnItem[]> {
    const conn = this.ensureConnected();
    const targetSchema = schema || "";
    const query = `
      SELECT column_name AS name,
             data_type AS data_type,
             (is_nullable = 'YES') AS is_nullable,
             column_default AS default_value,
             character_maximum_length AS max_length,
             (column_key = 'PRI') AS is_primary_key
      FROM information_schema.columns
      WHERE table_name = ?
        AND table_schema = ?
      ORDER BY ordinal_position ASC;
    `;
    const [rows] = await conn.query(query, [table, targetSchema]);
    return (rows as any[]).map((r) => ({
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
    schema?: string,
    limit = 100
  ): Promise<DatabaseTableDataResult> {
    const conn = this.ensureConnected();
    const boundedLimit = Math.min(Math.max(limit, 1), 500);

    const safeSchema = schema ? `\`${schema.replace(/`/g, "``")}\`.` : "";
    const safeTable = `\`${table.replace(/`/g, "``")}\``;

    const query = `SELECT * FROM ${safeSchema}${safeTable} LIMIT ?`;
    const [rows, fields] = await conn.query(query, [boundedLimit]);

    const columns = Array.isArray(fields) ? fields.map((f: any) => f.name) : [];
    const rowList = (rows as any[]).map((row) => {
      const sanitizedRow: Record<string, unknown> = {};
      for (const col of columns) {
        sanitizedRow[col] = sanitizeValue(row[col]);
      }
      return sanitizedRow;
    });

    return {
      columns,
      rows: rowList,
      totalRows: rowList.length,
      truncated: rowList.length === boundedLimit,
    };
  }

  public async executeQuery(
    sql: string,
    maxRows = 500
  ): Promise<DatabaseQueryResult> {
    const conn = this.ensureConnected();
    const validatedSql = validateReadOnlySelect(sql, "mysql");
    const boundedLimit = Math.min(Math.max(maxRows, 1), 500);

    const startTime = Date.now();

    try {
      // Set transaction to read only where supported
      try {
        await conn.query("SET TRANSACTION READ ONLY;");
        await conn.query("START TRANSACTION;");
      } catch {
        // Fallback if read-only transaction mode is not supported by MySQL server version
      }

      const [rawRows, fields] = await conn.query({
        sql: validatedSql,
        timeout: 15000,
      });
      const executionTimeMs = Date.now() - startTime;

      try {
        await conn.query("COMMIT;");
      } catch {
        // ignore commit error
      }

      const columns = Array.isArray(fields) ? fields.map((f: any) => f.name) : [];
      let rows = (rawRows as any[]) || [];
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
        await conn.query("ROLLBACK;");
      } catch {
        // ignore rollback error
      }
      const error = err as Error;
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }
}
