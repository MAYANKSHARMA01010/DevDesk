export type DatabaseEngine = "postgres" | "mysql";

export interface DatabaseConnectionProfile {
  id: string;
  name: string;
  type: DatabaseEngine;
  host: string;
  port: number;
  username: string;
  database: string;
  ssl: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseConnectionStatus {
  profileId: string;
  connected: boolean;
  connectedAt?: string;
  lastError?: string;
  serverVersion?: string;
}

export interface CreateConnectionProfileInput {
  name: string;
  type: DatabaseEngine;
  host: string;
  port: number;
  username: string;
  database: string;
  ssl?: boolean;
}

export interface UpdateConnectionProfileInput {
  name?: string;
  type?: DatabaseEngine;
  host?: string;
  port?: number;
  username?: string;
  database?: string;
  ssl?: boolean;
}

export interface DatabaseCredentialsInput {
  password?: string;
}

export interface DatabaseSchemaItem {
  name: string;
}

export interface DatabaseTableItem {
  name: string;
  schema: string;
  type: "table" | "view";
}

export interface DatabaseColumnItem {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  defaultValue?: string | null;
  maxLength?: number | null;
}

export interface DatabaseTableDataResult {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  truncated: boolean;
}

export interface DatabaseQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  truncated: boolean;
}

// API Responses
export interface DatabaseProfilesResponse {
  success: boolean;
  data?: DatabaseConnectionProfile[];
  error?: string;
}

export interface DatabaseProfileResponse {
  success: boolean;
  data?: DatabaseConnectionProfile;
  error?: string;
}

export interface DatabaseConnectionStatusResponse {
  success: boolean;
  data?: DatabaseConnectionStatus;
  error?: string;
}

export interface DatabaseSchemasResponse {
  success: boolean;
  data?: DatabaseSchemaItem[];
  error?: string;
}

export interface DatabaseTablesResponse {
  success: boolean;
  data?: DatabaseTableItem[];
  error?: string;
}

export interface DatabaseColumnsResponse {
  success: boolean;
  data?: DatabaseColumnItem[];
  error?: string;
}

export interface DatabaseTableDataResponse {
  success: boolean;
  data?: DatabaseTableDataResult;
  error?: string;
}

export interface DatabaseQueryResponse {
  success: boolean;
  data?: DatabaseQueryResult;
  error?: string;
}
