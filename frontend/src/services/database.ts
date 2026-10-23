import {
  CreateConnectionProfileInput,
  DatabaseColumnItem,
  DatabaseColumnsResponse,
  DatabaseConnectionProfile,
  DatabaseConnectionStatus,
  DatabaseConnectionStatusResponse,
  DatabaseProfileResponse,
  DatabaseProfilesResponse,
  DatabaseQueryResponse,
  DatabaseQueryResult,
  DatabaseSchemaItem,
  DatabaseSchemasResponse,
  DatabaseTableDataResponse,
  DatabaseTableDataResult,
  DatabaseTableItem,
  DatabaseTablesResponse,
  UpdateConnectionProfileInput,
} from "@/types/database";
import { BACKEND_URL as BACKEND_BASE_URL } from "@/config/env";

/**
 * Fetches all saved database connection profiles from SQLite.
 * Calls GET /api/database/connections
 */
export async function fetchDatabaseConnections(): Promise<DatabaseConnectionProfile[]> {
  const queryUrl = `${BACKEND_BASE_URL}/api/database/connections`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(
      `Cannot connect to DevDesk backend at ${BACKEND_BASE_URL} (${errorMsg}). Ensure the backend is running.`
    );
  }

  let json: DatabaseProfilesResponse;
  try {
    json = (await response.json()) as DatabaseProfilesResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to fetch connection profiles (${response.status}).`);
  }

  return json.data;
}

/**
 * Creates a new saved database connection profile.
 * Calls POST /api/database/connections
 */
export async function createDatabaseConnection(
  input: CreateConnectionProfileInput
): Promise<DatabaseConnectionProfile> {
  const queryUrl = `${BACKEND_BASE_URL}/api/database/connections`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(`Cannot connect to DevDesk backend (${errorMsg}).`);
  }

  let json: DatabaseProfileResponse;
  try {
    json = (await response.json()) as DatabaseProfileResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to create connection profile (${response.status}).`);
  }

  return json.data;
}

/**
 * Updates an existing database connection profile.
 * Calls PUT /api/database/connections/:id
 */
export async function updateDatabaseConnection(
  id: string,
  input: UpdateConnectionProfileInput
): Promise<DatabaseConnectionProfile> {
  const queryUrl = `${BACKEND_BASE_URL}/api/database/connections/${encodeURIComponent(id)}`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(`Cannot connect to DevDesk backend (${errorMsg}).`);
  }

  let json: DatabaseProfileResponse;
  try {
    json = (await response.json()) as DatabaseProfileResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to update connection profile (${response.status}).`);
  }

  return json.data;
}

/**
 * Deletes a connection profile and disconnects any active session.
 * Calls DELETE /api/database/connections/:id
 */
export async function deleteDatabaseConnection(id: string): Promise<void> {
  const queryUrl = `${BACKEND_BASE_URL}/api/database/connections/${encodeURIComponent(id)}`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { method: "DELETE" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(`Cannot connect to DevDesk backend (${errorMsg}).`);
  }

  if (!response.ok) {
    let error = `Failed to delete connection profile (${response.status}).`;
    try {
      const json = await response.json();
      if (json.error) error = json.error;
    } catch {
      // ignore parse error
    }
    throw new Error(error);
  }
}

/**
 * Tests connection settings without establishing a permanent session.
 */
export async function testDatabaseConnection(
  idOrInput: string | CreateConnectionProfileInput,
  password?: string
): Promise<{ serverVersion: string; message: string }> {
  const isProfileId = typeof idOrInput === "string";
  const queryUrl = isProfileId
    ? `${BACKEND_BASE_URL}/api/database/connections/${encodeURIComponent(idOrInput)}/test`
    : `${BACKEND_BASE_URL}/api/database/test`;

  const payload = isProfileId
    ? { password }
    : { ...idOrInput, password };

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(`Cannot connect to DevDesk backend (${errorMsg}).`);
  }

  let json: any;
  try {
    json = await response.json();
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Connection test failed (${response.status}).`);
  }

  return json.data;
}

/**
 * Establishes an active connection using credentials supplied in request body.
 * Calls POST /api/database/connections/:id/connect
 */
export async function connectDatabase(
  id: string,
  password?: string
): Promise<DatabaseConnectionStatus> {
  const queryUrl = `${BACKEND_BASE_URL}/api/database/connections/${encodeURIComponent(id)}/connect`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(`Cannot connect to DevDesk backend (${errorMsg}).`);
  }

  let json: DatabaseConnectionStatusResponse;
  try {
    json = (await response.json()) as DatabaseConnectionStatusResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to connect to database (${response.status}).`);
  }

  return json.data;
}

/**
 * Closes an active connection session.
 * Calls POST /api/database/connections/:id/disconnect
 */
export async function disconnectDatabase(
  id: string
): Promise<DatabaseConnectionStatus> {
  const queryUrl = `${BACKEND_BASE_URL}/api/database/connections/${encodeURIComponent(id)}/disconnect`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { method: "POST" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(`Cannot connect to DevDesk backend (${errorMsg}).`);
  }

  let json: DatabaseConnectionStatusResponse;
  try {
    json = (await response.json()) as DatabaseConnectionStatusResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to disconnect database (${response.status}).`);
  }

  return json.data;
}

/**
 * Checks active connection status for a profile.
 * Calls GET /api/database/connections/:id/status
 */
export async function fetchConnectionStatus(
  id: string
): Promise<DatabaseConnectionStatus> {
  const queryUrl = `${BACKEND_BASE_URL}/api/database/connections/${encodeURIComponent(id)}/status`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(`Cannot connect to DevDesk backend (${errorMsg}).`);
  }

  let json: DatabaseConnectionStatusResponse;
  try {
    json = (await response.json()) as DatabaseConnectionStatusResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    return { profileId: id, connected: false };
  }

  return json.data;
}

/**
 * Fetches available schemas/databases for an active connection.
 * Calls GET /api/database/connections/:id/schemas
 */
export async function fetchSchemas(id: string): Promise<DatabaseSchemaItem[]> {
  const queryUrl = `${BACKEND_BASE_URL}/api/database/connections/${encodeURIComponent(id)}/schemas`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(`Cannot connect to DevDesk backend (${errorMsg}).`);
  }

  let json: DatabaseSchemasResponse;
  try {
    json = (await response.json()) as DatabaseSchemasResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to fetch schemas (${response.status}).`);
  }

  return json.data;
}

/**
 * Fetches tables in a schema.
 * Calls GET /api/database/connections/:id/tables?schema=:schema
 */
export async function fetchTables(
  id: string,
  schema?: string
): Promise<DatabaseTableItem[]> {
  const queryUrl = `${BACKEND_BASE_URL}/api/database/connections/${encodeURIComponent(id)}/tables${
    schema ? `?schema=${encodeURIComponent(schema)}` : ""
  }`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(`Cannot connect to DevDesk backend (${errorMsg}).`);
  }

  let json: DatabaseTablesResponse;
  try {
    json = (await response.json()) as DatabaseTablesResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to fetch tables (${response.status}).`);
  }

  return json.data;
}

/**
 * Describes column metadata for a table.
 * Calls GET /api/database/connections/:id/tables/:table/columns?schema=:schema
 */
export async function fetchTableColumns(
  id: string,
  table: string,
  schema?: string
): Promise<DatabaseColumnItem[]> {
  const queryUrl = `${BACKEND_BASE_URL}/api/database/connections/${encodeURIComponent(id)}/tables/${encodeURIComponent(table)}/columns${
    schema ? `?schema=${encodeURIComponent(schema)}` : ""
  }`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(`Cannot connect to DevDesk backend (${errorMsg}).`);
  }

  let json: DatabaseColumnsResponse;
  try {
    json = (await response.json()) as DatabaseColumnsResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to fetch column metadata (${response.status}).`);
  }

  return json.data;
}

/**
 * Fetches sample rows for a table.
 * Calls GET /api/database/connections/:id/tables/:table/rows?schema=:schema&limit=:limit
 */
export async function fetchTableSampleRows(
  id: string,
  table: string,
  schema?: string,
  limit = 100
): Promise<DatabaseTableDataResult> {
  const queryUrl = `${BACKEND_BASE_URL}/api/database/connections/${encodeURIComponent(id)}/tables/${encodeURIComponent(table)}/rows?limit=${limit}${
    schema ? `&schema=${encodeURIComponent(schema)}` : ""
  }`;

  let response: Response;
  try {
    response = await fetch(queryUrl, { cache: "no-store" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(`Cannot connect to DevDesk backend (${errorMsg}).`);
  }

  let json: DatabaseTableDataResponse;
  try {
    json = (await response.json()) as DatabaseTableDataResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Failed to fetch sample data (${response.status}).`);
  }

  return json.data;
}

/**
 * Executes a read-only SELECT SQL query.
 * Calls POST /api/database/connections/:id/query
 */
export async function executeDatabaseQuery(
  id: string,
  query: string,
  maxRows = 500
): Promise<DatabaseQueryResult> {
  const queryUrl = `${BACKEND_BASE_URL}/api/database/connections/${encodeURIComponent(id)}/query`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, maxRows }),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    throw new Error(`Cannot connect to DevDesk backend (${errorMsg}).`);
  }

  let json: DatabaseQueryResponse;
  try {
    json = (await response.json()) as DatabaseQueryResponse;
  } catch {
    throw new Error(`Invalid response received from backend (${response.status}).`);
  }

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Query execution failed (${response.status}).`);
  }

  return json.data;
}
