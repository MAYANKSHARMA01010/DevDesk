"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  connectDatabase,
  createDatabaseConnection,
  deleteDatabaseConnection,
  disconnectDatabase,
  executeDatabaseQuery,
  fetchConnectionStatus,
  fetchDatabaseConnections,
  fetchSchemas,
  fetchTableColumns,
  fetchTables,
  fetchTableSampleRows,
  testDatabaseConnection,
  updateDatabaseConnection,
} from "@/services/database";
import {
  CreateConnectionProfileInput,
  DatabaseColumnItem,
  DatabaseConnectionProfile,
  DatabaseConnectionStatus,
  DatabaseEngine,
  DatabaseQueryResult,
  DatabaseSchemaItem,
  DatabaseTableDataResult,
  DatabaseTableItem,
} from "@/types/database";

export function DatabaseView() {
  const baseId = useId();

  // Connection Profiles & Selection
  const [profiles, setProfiles] = useState<DatabaseConnectionProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [connectionStatuses, setConnectionStatuses] = useState<
    Record<string, DatabaseConnectionStatus>
  >({});

  // Active Connection Metadata
  const [schemas, setSchemas] = useState<DatabaseSchemaItem[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<string>("");
  const [tables, setTables] = useState<DatabaseTableItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [tableSearchQuery, setTableSearchQuery] = useState<string>("");

  // Table Details
  const [tableTab, setTableTab] = useState<"columns" | "sample" | "query">("query");
  const [columns, setColumns] = useState<DatabaseColumnItem[]>([]);
  const [sampleData, setSampleData] = useState<DatabaseTableDataResult | null>(null);

  // SQL Query Editor
  const [sqlQuery, setSqlQuery] = useState<string>("");
  const [queryResult, setQueryResult] = useState<DatabaseQueryResult | null>(null);
  const [queryExecuting, setQueryExecuting] = useState<boolean>(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  // Modals & Forms
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<CreateConnectionProfileInput>({
    name: "",
    type: "postgres",
    host: "localhost",
    port: 5432,
    username: "postgres",
    database: "postgres",
    ssl: false,
  });
  const [profileFormPassword, setProfileFormPassword] = useState<string>("");
  const [formTestResult, setFormTestResult] = useState<string | null>(null);
  const [formTestLoading, setFormTestLoading] = useState<boolean>(false);

  // Connect Password Prompt Modal
  const [showConnectModal, setShowConnectModal] = useState<boolean>(false);
  const [connectPromptPassword, setConnectPromptPassword] = useState<string>("");
  const [connecting, setConnecting] = useState<boolean>(false);

  // General Loading & Status Feedback
  const [loadingProfiles, setLoadingProfiles] = useState<boolean>(true);
  const [loadingExplorer, setLoadingExplorer] = useState<boolean>(false);
  const [loadingTableDetails, setLoadingTableDetails] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);

  const activeProfile = profiles.find((p) => p.id === selectedProfileId) || null;
  const isConnected = Boolean(
    selectedProfileId && connectionStatuses[selectedProfileId]?.connected
  );

  // 1. Initial Load: Connection Profiles
  useEffect(() => {
    isMountedRef.current = true;
    loadProfiles();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  async function loadProfiles(preferredSelectId?: string) {
    try {
      setLoadingProfiles(true);
      const loaded = await fetchDatabaseConnections();
      if (!isMountedRef.current) return;
      setProfiles(loaded);

      if (loaded.length > 0) {
        const nextId =
          preferredSelectId && loaded.some((p) => p.id === preferredSelectId)
            ? preferredSelectId
            : selectedProfileId && loaded.some((p) => p.id === selectedProfileId)
            ? selectedProfileId
            : loaded[0].id;
        setSelectedProfileId(nextId);
        checkStatus(nextId);
      } else {
        setSelectedProfileId("");
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to load database profiles."
      );
    } finally {
      if (isMountedRef.current) {
        setLoadingProfiles(false);
      }
    }
  }

  async function checkStatus(profileId: string) {
    try {
      const status = await fetchConnectionStatus(profileId);
      if (!isMountedRef.current) return;
      setConnectionStatuses((prev) => ({ ...prev, [profileId]: status }));
      if (status.connected) {
        loadSchemasAndTables(profileId);
      }
    } catch {
      // Ignore status check errors
    }
  }

  // When selectedProfileId changes, refresh status and explorer
  useEffect(() => {
    if (selectedProfileId) {
      checkStatus(selectedProfileId);
    } else {
      setSchemas([]);
      setTables([]);
      setSelectedTable("");
      setColumns([]);
      setSampleData(null);
    }
  }, [selectedProfileId]);

  // Load Schemas and Tables
  async function loadSchemasAndTables(profileId: string) {
    try {
      setLoadingExplorer(true);
      const schemaList = await fetchSchemas(profileId);
      if (!isMountedRef.current) return;
      setSchemas(schemaList);

      const defaultSchema =
        schemaList.find((s) => s.name === "public")?.name ||
        (schemaList.length > 0 ? schemaList[0].name : "");
      setSelectedSchema(defaultSchema);

      const tableList = await fetchTables(profileId, defaultSchema);
      if (!isMountedRef.current) return;
      setTables(tableList);

      if (tableList.length > 0) {
        handleSelectTable(tableList[0].name, defaultSchema, profileId);
      } else {
        setSelectedTable("");
        setColumns([]);
        setSampleData(null);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to browse schemas/tables."
      );
    } finally {
      if (isMountedRef.current) {
        setLoadingExplorer(false);
      }
    }
  }

  // Handle schema change
  async function handleSchemaChange(newSchema: string) {
    setSelectedSchema(newSchema);
    if (!selectedProfileId) return;
    try {
      setLoadingExplorer(true);
      const tableList = await fetchTables(selectedProfileId, newSchema);
      if (!isMountedRef.current) return;
      setTables(tableList);
      if (tableList.length > 0) {
        handleSelectTable(tableList[0].name, newSchema, selectedProfileId);
      } else {
        setSelectedTable("");
        setColumns([]);
        setSampleData(null);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to load tables for schema."
      );
    } finally {
      setLoadingExplorer(false);
    }
  }

  // Handle table selection
  async function handleSelectTable(
    tableName: string,
    schema = selectedSchema,
    profileId = selectedProfileId
  ) {
    setSelectedTable(tableName);
    if (!profileId || !tableName) return;

    try {
      setLoadingTableDetails(true);
      const [colData, rowData] = await Promise.all([
        fetchTableColumns(profileId, tableName, schema),
        fetchTableSampleRows(profileId, tableName, schema, 100),
      ]);
      if (!isMountedRef.current) return;
      setColumns(colData);
      setSampleData(rowData);

      // Pre-populate query editor with safe template
      const safeIdent =
        activeProfile?.type === "postgres"
          ? `"${schema}"."${tableName}"`
          : `\`${schema}\`.\`${tableName}\``;
      setSqlQuery(`SELECT * FROM ${safeIdent} LIMIT 50;`);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to load table details."
      );
    } finally {
      if (isMountedRef.current) {
        setLoadingTableDetails(false);
      }
    }
  }

  // Connect & Disconnect handlers
  async function handleExecuteConnect() {
    if (!selectedProfileId) return;
    try {
      setConnecting(true);
      setErrorMessage(null);

      const status = await connectDatabase(selectedProfileId, connectPromptPassword);
      setConnectionStatuses((prev) => ({ ...prev, [selectedProfileId]: status }));
      setShowConnectModal(false);
      setConnectPromptPassword("");
      setSuccessMessage(`Connected successfully to ${status.serverVersion || "database"}.`);

      await loadSchemasAndTables(selectedProfileId);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Connection failed."
      );
    } finally {
      setConnecting(false);
    }
  }

  async function handleExecuteDisconnect() {
    if (!selectedProfileId) return;
    try {
      const status = await disconnectDatabase(selectedProfileId);
      setConnectionStatuses((prev) => ({ ...prev, [selectedProfileId]: status }));
      setSchemas([]);
      setTables([]);
      setSelectedTable("");
      setColumns([]);
      setSampleData(null);
      setQueryResult(null);
      setSuccessMessage("Disconnected from database.");
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to disconnect."
      );
    }
  }

  // Profile Form Handlers
  function openCreateProfileModal() {
    setEditingProfileId(null);
    setProfileForm({
      name: "Local Postgres",
      type: "postgres",
      host: "localhost",
      port: 5432,
      username: "postgres",
      database: "postgres",
      ssl: false,
    });
    setProfileFormPassword("");
    setFormTestResult(null);
    setShowProfileModal(true);
  }

  function openEditProfileModal(profile: DatabaseConnectionProfile) {
    setEditingProfileId(profile.id);
    setProfileForm({
      name: profile.name,
      type: profile.type,
      host: profile.host,
      port: profile.port,
      username: profile.username,
      database: profile.database,
      ssl: profile.ssl,
    });
    setProfileFormPassword("");
    setFormTestResult(null);
    setShowProfileModal(true);
  }

  function handleEngineChange(engine: DatabaseEngine) {
    setProfileForm((prev) => ({
      ...prev,
      type: engine,
      port: engine === "postgres" ? 5432 : 3306,
      username: engine === "postgres" ? "postgres" : "root",
      database: engine === "postgres" ? "postgres" : "",
    }));
  }

  async function handleTestFromModal() {
    try {
      setFormTestLoading(true);
      setFormTestResult(null);
      const res = await testDatabaseConnection(profileForm, profileFormPassword);
      setFormTestResult(`✅ ${res.message}`);
    } catch (err: unknown) {
      setFormTestResult(
        `❌ ${err instanceof Error ? err.message : "Connection test failed."}`
      );
    } finally {
      setFormTestLoading(false);
    }
  }

  async function handleSaveProfile() {
    try {
      setErrorMessage(null);
      if (editingProfileId) {
        const updated = await updateDatabaseConnection(editingProfileId, profileForm);
        setSuccessMessage(`Updated profile "${updated.name}".`);
        setShowProfileModal(false);
        await loadProfiles(updated.id);
      } else {
        const created = await createDatabaseConnection(profileForm);
        setSuccessMessage(`Created profile "${created.name}".`);
        setShowProfileModal(false);
        await loadProfiles(created.id);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to save profile."
      );
    }
  }

  async function handleDeleteProfile(id: string, name: string) {
    if (!window.confirm(`Are you sure you want to delete profile "${name}"?`)) {
      return;
    }
    try {
      await deleteDatabaseConnection(id);
      setSuccessMessage(`Deleted connection profile "${name}".`);
      await loadProfiles();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to delete profile."
      );
    }
  }

  // Query Execution Handler
  async function handleRunQuery() {
    if (!selectedProfileId) return;
    if (!sqlQuery.trim()) {
      setQueryError("Please enter a SQL query.");
      return;
    }

    try {
      setQueryExecuting(true);
      setQueryError(null);
      const result = await executeDatabaseQuery(selectedProfileId, sqlQuery, 500);
      setQueryResult(result);
    } catch (err: unknown) {
      setQueryError(
        err instanceof Error ? err.message : "Query execution failed."
      );
      setQueryResult(null);
    } finally {
      setQueryExecuting(false);
    }
  }

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(tableSearchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full text-zinc-100 p-6 overflow-hidden">
      {/* Top Header: Title, Description, and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
              Database Manager
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
              PostgreSQL & MySQL
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Connect to relational databases, inspect schemas & columns, and execute read-only queries with safety guards.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openCreateProfileModal}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <span>+</span>
            <span>New Connection</span>
          </button>
        </div>
      </div>

      {/* Advisory Note */}
      <div className="my-3 px-3.5 py-2 rounded-md bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400 shrink-0">
        <div className="flex items-center gap-2">
          <span>🔒</span>
          <span>
            <strong>Credential Security:</strong> Database passwords are kept strictly in memory for the active session and are never saved to SQLite or disk.
          </span>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono hidden md:inline">
          Read-Only Enforcement Enabled
        </span>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="mb-3 px-3 py-2 rounded bg-rose-950/50 border border-rose-800 text-xs text-rose-300 flex items-center justify-between shrink-0">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-200 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mb-3 px-3 py-2 rounded bg-emerald-950/50 border border-emerald-800 text-xs text-emerald-300 flex items-center justify-between shrink-0">
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-400 hover:text-emerald-200 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Two-Panel Layout */}
      {profiles.length === 0 && !loadingProfiles ? (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-8 bg-zinc-900/20 text-center mt-2">
          <div className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xl mb-3">
            🗄️
          </div>
          <h3 className="text-sm font-semibold text-zinc-200">No Saved Connections</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm">
            Add a PostgreSQL or MySQL connection profile to begin browsing schemas, tables, and executing queries.
          </p>
          <button
            onClick={openCreateProfileModal}
            className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition-colors"
          >
            Create Connection Profile
          </button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-4 mt-1 overflow-hidden">
          {/* Left Column (Connections & Schema Explorer, col-span-4) */}
          <div className="md:col-span-4 flex flex-col h-full bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
            {/* Connection Selector Header */}
            <div className="p-3 bg-zinc-900/70 border-b border-zinc-800 shrink-0">
              <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block mb-1.5">
                Active Connection
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                >
                  {profiles.map((p) => {
                    const status = connectionStatuses[p.id];
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.type === "postgres" ? "PostgreSQL" : "MySQL"}) {status?.connected ? "🟢" : "⚪"}
                      </option>
                    );
                  })}
                </select>

                {activeProfile && (
                  <button
                    onClick={() => openEditProfileModal(activeProfile)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded text-xs transition-colors"
                    title="Edit profile"
                  >
                    ✏️
                  </button>
                )}

                {activeProfile && (
                  <button
                    onClick={() => handleDeleteProfile(activeProfile.id, activeProfile.name)}
                    className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 rounded text-xs transition-colors"
                    title="Delete profile"
                  >
                    🗑️
                  </button>
                )}
              </div>

              {/* Connection Status & Toggle */}
              {activeProfile && (
                <div className="mt-3 flex items-center justify-between pt-2 border-t border-zinc-800/60">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isConnected ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
                      }`}
                    />
                    <span className="text-zinc-300">
                      {isConnected
                        ? connectionStatuses[selectedProfileId]?.serverVersion || "Connected"
                        : "Disconnected"}
                    </span>
                  </div>

                  {isConnected ? (
                    <button
                      onClick={handleExecuteDisconnect}
                      className="px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/60 rounded transition-colors"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowConnectModal(true)}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition-colors"
                    >
                      Connect...
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Schema & Table Explorer */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {!isConnected ? (
                <div className="p-6 text-center text-zinc-500 text-xs flex-1 flex flex-col items-center justify-center">
                  <span>Connect to browse schemas and tables.</span>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Schema Selector Bar */}
                  {schemas.length > 0 && (
                    <div className="p-2.5 border-b border-zinc-800 bg-zinc-900/30 flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-mono text-zinc-400">Schema:</span>
                      <select
                        value={selectedSchema}
                        onChange={(e) => handleSchemaChange(e.target.value)}
                        className="flex-1 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none"
                      >
                        {schemas.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Table Search Filter */}
                  <div className="p-2 border-b border-zinc-800/80 shrink-0">
                    <input
                      type="text"
                      placeholder="Filter tables..."
                      value={tableSearchQuery}
                      onChange={(e) => setTableSearchQuery(e.target.value)}
                      className="w-full px-2.5 py-1 bg-zinc-900 border border-zinc-700/80 rounded text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
                    />
                  </div>

                  {/* Table List */}
                  <div className="flex-1 overflow-y-auto p-1 divide-y divide-zinc-900">
                    {loadingExplorer ? (
                      <div className="p-4 text-center text-zinc-500 text-xs">
                        Loading schemas and tables...
                      </div>
                    ) : filteredTables.length === 0 ? (
                      <div className="p-4 text-center text-zinc-500 text-xs">
                        No tables found in schema "{selectedSchema}".
                      </div>
                    ) : (
                      filteredTables.map((tbl) => {
                        const isSelected = selectedTable === tbl.name;
                        return (
                          <button
                            key={tbl.name}
                            onClick={() => handleSelectTable(tbl.name)}
                            className={`w-full text-left px-2.5 py-1.5 rounded text-xs flex items-center justify-between transition-colors ${
                              isSelected
                                ? "bg-zinc-800 text-zinc-100 font-medium"
                                : "text-zinc-300 hover:bg-zinc-900"
                            }`}
                          >
                            <span className="font-mono truncate">{tbl.name}</span>
                            <span
                              className={`text-[9px] px-1 py-0.5 rounded uppercase font-mono ${
                                tbl.type === "view"
                                  ? "bg-purple-950/60 text-purple-400 border border-purple-800/50"
                                  : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              {tbl.type}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (Tabs: Query Editor, Columns, Sample Data, col-span-8) */}
          <div className="md:col-span-8 flex flex-col h-full bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
            {/* View Mode Tabs */}
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/70 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTableTab("query")}
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    tableTab === "query"
                      ? "bg-zinc-800 text-zinc-100 font-medium border border-zinc-700"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  SQL Query Editor
                </button>
                <button
                  onClick={() => setTableTab("columns")}
                  disabled={!selectedTable}
                  className={`px-3 py-1 rounded text-xs transition-colors disabled:opacity-40 ${
                    tableTab === "columns"
                      ? "bg-zinc-800 text-zinc-100 font-medium border border-zinc-700"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Columns {selectedTable && `(${columns.length})`}
                </button>
                <button
                  onClick={() => setTableTab("sample")}
                  disabled={!selectedTable}
                  className={`px-3 py-1 rounded text-xs transition-colors disabled:opacity-40 ${
                    tableTab === "sample"
                      ? "bg-zinc-800 text-zinc-100 font-medium border border-zinc-700"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Sample Data {selectedTable && `(${sampleData?.rows.length || 0})`}
                </button>
              </div>

              {selectedTable && (
                <div className="text-xs text-zinc-400 font-mono hidden sm:inline">
                  Table: <strong className="text-zinc-200">{selectedTable}</strong>
                </div>
              )}
            </div>

            {/* Tab 1: SQL Query Editor */}
            {tableTab === "query" && (
              <div className="flex-1 flex flex-col min-h-0 p-4">
                {/* Editor Box */}
                <div className="flex flex-col flex-1 min-h-[160px] max-h-[240px] mb-3">
                  <div className="flex items-center justify-between mb-1.5 text-xs text-zinc-400">
                    <span className="font-mono">Read-Only SQL (SELECT statements only)</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSqlQuery("")}
                        className="text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    placeholder="SELECT * FROM table_name LIMIT 50;"
                    spellCheck={false}
                    disabled={!isConnected}
                    className="flex-1 w-full bg-zinc-950 font-mono text-xs text-zinc-200 p-3 border border-zinc-800 rounded-md resize-none focus:outline-none focus:border-zinc-600 disabled:opacity-50 leading-relaxed"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-zinc-500">
                      Ctrl+Enter or Cmd+Enter to execute.
                    </span>
                    <button
                      onClick={handleRunQuery}
                      disabled={!isConnected || queryExecuting || !sqlQuery.trim()}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      {queryExecuting ? "Executing..." : "Run Query"}
                    </button>
                  </div>
                </div>

                {/* Error Banner */}
                {queryError && (
                  <div className="mb-3 p-2.5 rounded bg-rose-950/50 border border-rose-800 text-xs text-rose-300 font-mono shrink-0">
                    {queryError}
                  </div>
                )}

                {/* Query Results Table */}
                <div className="flex-1 flex flex-col min-h-0 border border-zinc-800 rounded-md overflow-hidden bg-zinc-950">
                  <div className="px-3 py-1.5 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between text-xs text-zinc-400 font-mono shrink-0">
                    <span>
                      Results:{" "}
                      <strong className="text-zinc-200">
                        {queryResult ? `${queryResult.rowCount} rows` : "No query executed"}
                      </strong>
                    </span>
                    {queryResult && (
                      <div className="flex items-center gap-3">
                        <span>Duration: {queryResult.executionTimeMs}ms</span>
                        {queryResult.truncated && (
                          <span className="text-amber-400">Truncated (max 500 rows)</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 overflow-auto">
                    {!queryResult ? (
                      <div className="p-8 text-center text-zinc-500 text-xs">
                        Enter a SELECT query above and click "Run Query" to inspect results.
                      </div>
                    ) : queryResult.rows.length === 0 ? (
                      <div className="p-8 text-center text-zinc-500 text-xs font-mono">
                        Query returned 0 rows.
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse text-xs font-mono">
                        <thead className="sticky top-0 bg-zinc-900 text-zinc-400 border-b border-zinc-800 shadow-sm">
                          <tr>
                            {queryResult.columns.map((col) => (
                              <th key={col} className="py-2 px-3 whitespace-nowrap font-medium">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                          {queryResult.rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                              {queryResult.columns.map((col) => (
                                <td key={col} className="py-1.5 px-3 whitespace-nowrap max-w-xs truncate">
                                  {row[col] === null ? (
                                    <span className="text-zinc-500 italic">NULL</span>
                                  ) : (
                                    String(row[col])
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Columns */}
            {tableTab === "columns" && (
              <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="py-2 px-3">Column</th>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3">Nullable</th>
                      <th className="py-2 px-3">Key</th>
                      <th className="py-2 px-3">Default</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-200">
                    {columns.map((col) => (
                      <tr key={col.name} className="hover:bg-zinc-900/40">
                        <td className="py-2 px-3 font-semibold text-zinc-100 flex items-center gap-1.5">
                          {col.isPrimaryKey && <span title="Primary Key">🔑</span>}
                          <span>{col.name}</span>
                        </td>
                        <td className="py-2 px-3 text-cyan-400">{col.dataType}</td>
                        <td className="py-2 px-3">
                          {col.isNullable ? (
                            <span className="text-zinc-400">YES</span>
                          ) : (
                            <span className="text-amber-400/90 font-medium">NO</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {col.isPrimaryKey ? (
                            <span className="text-amber-400 font-bold">PRIMARY KEY</span>
                          ) : (
                            <span className="text-zinc-600">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-zinc-400">
                          {col.defaultValue || <span className="text-zinc-600">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 3: Sample Data */}
            {tableTab === "sample" && (
              <div className="flex-1 flex flex-col min-h-0 overflow-auto p-4">
                {!sampleData || sampleData.rows.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 text-xs">
                    Table is empty.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead className="sticky top-0 bg-zinc-900 text-zinc-400 border-b border-zinc-800">
                      <tr>
                        {sampleData.columns.map((col) => (
                          <th key={col} className="py-2 px-3 whitespace-nowrap font-medium">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                      {sampleData.rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-zinc-900/40">
                          {sampleData.columns.map((col) => (
                            <td key={col} className="py-1.5 px-3 whitespace-nowrap max-w-xs truncate">
                              {row[col] === null ? (
                                <span className="text-zinc-500 italic">NULL</span>
                              ) : (
                                String(row[col])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Connect Password Prompt */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg max-w-md w-full p-5 shadow-2xl text-zinc-100">
            <h3 className="text-base font-semibold text-zinc-100">
              Connect to {activeProfile?.name}
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Enter password for user{" "}
              <strong className="text-zinc-200">{activeProfile?.username}</strong> on{" "}
              <strong className="text-zinc-200">{activeProfile?.host}</strong>.
            </p>

            <div className="my-4">
              <label className="text-xs text-zinc-300 font-medium block mb-1">
                Password:
              </label>
              <input
                type="password"
                value={connectPromptPassword}
                onChange={(e) => setConnectPromptPassword(e.target.value)}
                placeholder="Database password"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleExecuteConnect();
                }}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
              />
              <span className="text-[10px] text-zinc-500 mt-1.5 block">
                Held in memory for the active connection. Never saved to disk.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={() => setShowConnectModal(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteConnect}
                disabled={connecting}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition-colors"
              >
                {connecting ? "Connecting..." : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create / Edit Profile */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg max-w-lg w-full p-5 shadow-2xl text-zinc-100">
            <h3 className="text-base font-semibold text-zinc-100 mb-1">
              {editingProfileId ? "Edit Connection Profile" : "New Connection Profile"}
            </h3>
            <p className="text-xs text-zinc-400 mb-4">
              Configure parameters for a PostgreSQL or MySQL database connection.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-300 font-medium mb-1">
                  Profile Name:
                </label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) =>
                    setProfileForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g. Local Postgres or Staging MySQL"
                  className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    Database Engine:
                  </label>
                  <select
                    value={profileForm.type}
                    onChange={(e) =>
                      handleEngineChange(e.target.value as DatabaseEngine)
                    }
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-zinc-500"
                  >
                    <option value="postgres">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Port:</label>
                  <input
                    type="number"
                    value={profileForm.port}
                    onChange={(e) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        port: parseInt(e.target.value, 10) || 5432,
                      }))
                    }
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-zinc-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Host:</label>
                  <input
                    type="text"
                    value={profileForm.host}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, host: e.target.value }))
                    }
                    placeholder="localhost or 127.0.0.1"
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-zinc-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    Database Name:
                  </label>
                  <input
                    type="text"
                    value={profileForm.database}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, database: e.target.value }))
                    }
                    placeholder="database_name"
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-zinc-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    Username:
                  </label>
                  <input
                    type="text"
                    value={profileForm.username}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, username: e.target.value }))
                    }
                    placeholder="postgres or root"
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-zinc-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    Password (for testing):
                  </label>
                  <input
                    type="password"
                    value={profileFormPassword}
                    onChange={(e) => setProfileFormPassword(e.target.value)}
                    placeholder="Optional for test"
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id={`${baseId}-ssl-check`}
                  checked={profileForm.ssl}
                  onChange={(e) =>
                    setProfileForm((prev) => ({ ...prev, ssl: e.target.checked }))
                  }
                  className="rounded border-zinc-700 bg-zinc-950"
                />
                <label htmlFor={`${baseId}-ssl-check`} className="text-zinc-300">
                  Enable SSL / TLS connection
                </label>
              </div>

              {formTestResult && (
                <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-[11px] font-mono">
                  {formTestResult}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-6 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={handleTestFromModal}
                disabled={formTestLoading}
                className="px-3 py-1.5 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-700 rounded transition-colors"
              >
                {formTestLoading ? "Testing..." : "Test Connection"}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition-colors"
                >
                  Save Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
