import { connectionRepository } from "./connectionRepository.js";
import { PostgresAdapter } from "./postgresAdapter.js";
import { MysqlAdapter } from "./mysqlAdapter.js";
import {
  CreateConnectionProfileInput,
  DatabaseColumnItem,
  DatabaseConnectionProfile,
  DatabaseConnectionStatus,
  DatabaseQueryResult,
  DatabaseSchemaItem,
  DatabaseTableDataResult,
  DatabaseTableItem,
  UpdateConnectionProfileInput,
} from "../../types/database.js";

type DatabaseAdapter = PostgresAdapter | MysqlAdapter;

interface ActiveConnectionEntry {
  adapter: DatabaseAdapter;
  connectedAt: string;
}

export class DatabaseService {
  // In-memory active connections map: profileId -> ActiveConnectionEntry
  private activeConnections = new Map<string, ActiveConnectionEntry>();

  /**
   * Retrieves all saved connection profiles from SQLite.
   */
  public getProfiles(): DatabaseConnectionProfile[] {
    return connectionRepository.getAll();
  }

  /**
   * Retrieves a single connection profile by ID.
   */
  public getProfileById(id: string): DatabaseConnectionProfile | null {
    return connectionRepository.getById(id);
  }

  /**
   * Validates profile input parameters.
   */
  private validateProfileInput(
    input: CreateConnectionProfileInput | UpdateConnectionProfileInput,
    isCreate = false
  ): void {
    if (isCreate) {
      const createInput = input as CreateConnectionProfileInput;
      if (!createInput.name || typeof createInput.name !== "string" || !createInput.name.trim()) {
        throw new Error("Connection profile name is required.");
      }
      if (createInput.type !== "postgres" && createInput.type !== "mysql") {
        throw new Error("Supported database engines are 'postgres' and 'mysql'.");
      }
      if (!createInput.host || typeof createInput.host !== "string" || !createInput.host.trim()) {
        throw new Error("Database host is required.");
      }
      if (!createInput.username || typeof createInput.username !== "string" || !createInput.username.trim()) {
        throw new Error("Database username is required.");
      }
      if (!createInput.database || typeof createInput.database !== "string" || !createInput.database.trim()) {
        throw new Error("Database name is required.");
      }
    }

    if (input.port !== undefined) {
      const portNum = Number(input.port);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        throw new Error("Port must be a valid integer between 1 and 65535.");
      }
    }
  }

  /**
   * Creates a new connection profile in SQLite.
   */
  public createProfile(input: CreateConnectionProfileInput): DatabaseConnectionProfile {
    this.validateProfileInput(input, true);

    const defaultPort = input.type === "postgres" ? 5432 : 3306;
    const profileToCreate: CreateConnectionProfileInput = {
      ...input,
      port: input.port ? Number(input.port) : defaultPort,
    };

    return connectionRepository.create(profileToCreate);
  }

  /**
   * Updates an existing connection profile.
   */
  public updateProfile(
    id: string,
    input: UpdateConnectionProfileInput
  ): DatabaseConnectionProfile {
    this.validateProfileInput(input, false);
    return connectionRepository.update(id, input);
  }

  /**
   * Deletes a connection profile and closes any active connection.
   */
  public async deleteProfile(id: string): Promise<boolean> {
    await this.disconnect(id);
    return connectionRepository.delete(id);
  }

  /**
   * Creates an adapter instance for a profile.
   */
  private createAdapter(type: "postgres" | "mysql"): DatabaseAdapter {
    return type === "postgres" ? new PostgresAdapter() : new MysqlAdapter();
  }

  /**
   * Tests a database connection without persisting active connection state.
   */
  public async testConnection(
    profileOrInput: DatabaseConnectionProfile | CreateConnectionProfileInput,
    password?: string
  ): Promise<{ serverVersion: string; message: string }> {
    const adapter = this.createAdapter(profileOrInput.type);

    const tempProfile: DatabaseConnectionProfile = {
      id: "test",
      name: profileOrInput.name || "Test",
      type: profileOrInput.type,
      host: profileOrInput.host,
      port: Number(profileOrInput.port),
      username: profileOrInput.username,
      database: profileOrInput.database,
      ssl: Boolean(profileOrInput.ssl),
      createdAt: "",
      updatedAt: "",
    };

    try {
      await adapter.connect(tempProfile, password);
      const serverVersion = adapter.getServerVersion();
      await adapter.disconnect();
      return {
        serverVersion,
        message: `Successfully connected to ${serverVersion}.`,
      };
    } catch (err: unknown) {
      await adapter.disconnect();
      throw err;
    }
  }

  /**
   * Establishes an active connection for a saved profile.
   */
  public async connect(
    profileId: string,
    password?: string
  ): Promise<DatabaseConnectionStatus> {
    const profile = connectionRepository.getById(profileId);
    if (!profile) {
      throw new Error(`Database connection profile not found: "${profileId}".`);
    }

    // If an active connection already exists for this profile, disconnect it first
    if (this.activeConnections.has(profileId)) {
      await this.disconnect(profileId);
    }

    const adapter = this.createAdapter(profile.type);
    await adapter.connect(profile, password);

    const connectedAt = new Date().toISOString();
    this.activeConnections.set(profileId, {
      adapter,
      connectedAt,
    });

    return {
      profileId,
      connected: true,
      connectedAt,
      serverVersion: adapter.getServerVersion(),
    };
  }

  /**
   * Closes an active connection for a profile.
   */
  public async disconnect(profileId: string): Promise<DatabaseConnectionStatus> {
    const active = this.activeConnections.get(profileId);
    if (active) {
      await active.adapter.disconnect();
      this.activeConnections.delete(profileId);
    }

    return {
      profileId,
      connected: false,
    };
  }

  /**
   * Retrieves active connection status for a profile.
   */
  public getConnectionStatus(profileId: string): DatabaseConnectionStatus {
    const active = this.activeConnections.get(profileId);
    if (!active || !active.adapter.isConnected()) {
      return {
        profileId,
        connected: false,
      };
    }

    return {
      profileId,
      connected: true,
      connectedAt: active.connectedAt,
      serverVersion: active.adapter.getServerVersion(),
    };
  }

  /**
   * Retrieves an active adapter or throws an error.
   */
  private getActiveAdapter(profileId: string): DatabaseAdapter {
    const active = this.activeConnections.get(profileId);
    if (!active || !active.adapter.isConnected()) {
      throw new Error(
        `Database is not connected. Please establish an active connection for profile "${profileId}".`
      );
    }
    return active.adapter;
  }

  /**
   * Lists available schemas in the active database.
   */
  public async listSchemas(profileId: string): Promise<DatabaseSchemaItem[]> {
    const adapter = this.getActiveAdapter(profileId);
    return adapter.listSchemas();
  }

  /**
   * Lists tables and views in the selected schema.
   */
  public async listTables(
    profileId: string,
    schema?: string
  ): Promise<DatabaseTableItem[]> {
    const adapter = this.getActiveAdapter(profileId);
    return adapter.listTables(schema);
  }

  /**
   * Describes columns of a table.
   */
  public async describeTable(
    profileId: string,
    table: string,
    schema?: string
  ): Promise<DatabaseColumnItem[]> {
    const adapter = this.getActiveAdapter(profileId);
    return adapter.describeTable(table, schema);
  }

  /**
   * Retrieves a bounded sample of rows from a table.
   */
  public async sampleTableRows(
    profileId: string,
    table: string,
    schema?: string,
    limit = 100
  ): Promise<DatabaseTableDataResult> {
    const adapter = this.getActiveAdapter(profileId);
    return adapter.sampleTableRows(table, schema, limit);
  }

  /**
   * Executes a validated read-only SELECT query.
   */
  public async executeQuery(
    profileId: string,
    sql: string,
    maxRows = 500
  ): Promise<DatabaseQueryResult> {
    const adapter = this.getActiveAdapter(profileId);
    return adapter.executeQuery(sql, maxRows);
  }

  /**
   * Gracefully closes all active connections (called on shutdown).
   */
  public async closeAllConnections(): Promise<void> {
    for (const [profileId, entry] of this.activeConnections.entries()) {
      try {
        await entry.adapter.disconnect();
      } catch {
        // ignore errors during shutdown
      }
    }
    this.activeConnections.clear();
  }
}

export const databaseService = new DatabaseService();
