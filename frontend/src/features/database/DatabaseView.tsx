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
            : "";
        setSelectedProfileId(nextId);
        if (nextId) checkStatus(nextId);
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
    <div className="flex flex-col h-full text-[#E8EBF1] p-6 overflow-hidden">
      {/* Top Header: Title, Description, and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#303642] shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-[#E8EBF1]">
              Database Manager
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-[#272D38] text-[#8CA9CF] border border-[#303642]">
              PostgreSQL & MySQL
            </span>
          </div>
          <p className="text-xs text-[#A5ADBA] mt-1">
            Connect to relational databases, inspect schemas & columns, and execute read-only queries with safety guards.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openCreateProfileModal}
            className="px-3 py-1.5 bg-[#8CA9CF] hover:bg-[#A6BDE0] text-[#101216] rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <span>+</span>
            <span>New Connection</span>
          </button>
        </div>
      </div>

      {/* Advisory Note */}
      <div className="my-3 px-3.5 py-2 rounded-md bg-[#1D2129] border border-[#303642] flex items-center justify-between text-xs text-[#A5ADBA] shrink-0">
        <div className="flex items-center gap-2">
          <span>🔒</span>
          <span>
            <strong className="text-[#E8EBF1]">Credential Security:</strong> Database passwords are kept strictly in memory for the active session and are never saved to SQLite or disk.
          </span>
        </div>
        <span className="text-[10px] text-[#7C8594] font-mono hidden md:inline">
          Read-Only Enforcement Enabled
        </span>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="mb-3 px-3 py-2 rounded bg-[#E18B8B]/10 border border-[#E18B8B]/40 text-xs text-[#E18B8B] flex items-center justify-between shrink-0">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-[#E18B8B] hover:text-[#E8EBF1] ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mb-3 px-3 py-2 rounded bg-[#77B58A]/10 border border-[#77B58A]/40 text-xs text-[#77B58A] flex items-center justify-between shrink-0">
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-[#77B58A] hover:text-[#E8EBF1] ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Two-Panel Layout */}
      {profiles.length === 0 && !loadingProfiles ? (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-[#303642] rounded-lg p-8 bg-[#1D2129]/40 text-center mt-2">
          <div className="w-12 h-12 rounded-lg bg-[#272D38] border border-[#303642] flex items-center justify-center text-xl mb-3">
            🗄️
          </div>
          <h3 className="text-sm font-semibold text-[#E8EBF1]">No Saved Connections</h3>
          <p className="text-xs text-[#7C8594] mt-1 max-w-sm">
            Add a PostgreSQL or MySQL connection profile to begin browsing schemas, tables, and executing queries.
          </p>
          <button
            onClick={openCreateProfileModal}
            className="mt-4 px-4 py-2 bg-[#8CA9CF] hover:bg-[#A6BDE0] text-[#101216] rounded text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            Create Connection Profile
          </button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-4 mt-1 overflow-hidden">
          {/* Left Column (Connections & Schema Explorer, col-span-4) */}
          <div className="md:col-span-4 flex flex-col h-full bg-[#1D2129] border border-[#303642] rounded-lg overflow-hidden">
            {/* Connection Selector Header */}
            <div className="p-3 bg-[#171A20] border-b border-[#303642] shrink-0">
              <label className="text-[11px] font-mono text-[#7C8594] uppercase tracking-wider block mb-1.5">
                Active Connection
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 bg-[#272D38] border border-[#303642] rounded text-xs text-[#E8EBF1] focus:outline-none focus:border-[#8CA9CF]"
                >
                  <option value="">None (Select Connection)</option>
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
                    className="p-1.5 text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] rounded text-xs transition-colors cursor-pointer"
                    title="Edit profile"
                  >
                    ✏️
                  </button>
                )}

                {activeProfile && (
                  <button
                    onClick={() => handleDeleteProfile(activeProfile.id, activeProfile.name)}
                    className="p-1.5 text-[#A5ADBA] hover:text-[#E18B8B] hover:bg-[#272D38] rounded text-xs transition-colors cursor-pointer"
                    title="Delete profile"
                  >
                    🗑️
                  </button>
                )}
              </div>

              {/* Connection Status & Toggle */}
              {activeProfile && (
                <div className="mt-3 flex items-center justify-between pt-2 border-t border-[#303642]">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isConnected ? "bg-[#77B58A]" : "bg-[#7C8594]"
                      }`}
                    />
                    <span className="text-[#E8EBF1]">
                      {isConnected
                        ? connectionStatuses[selectedProfileId]?.serverVersion || "Connected"
                        : "Disconnected"}
                    </span>
                  </div>

                  {isConnected ? (
                    <button
                      onClick={handleExecuteDisconnect}
                      className="px-2.5 py-1 text-xs text-[#E18B8B] hover:text-[#E18B8B] hover:bg-[#E18B8B]/10 border border-[#E18B8B]/40 rounded transition-colors cursor-pointer"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowConnectModal(true)}
                      className="px-3 py-1 bg-[#8CA9CF] hover:bg-[#A6BDE0] text-[#101216] rounded text-xs font-semibold transition-colors shadow-xs cursor-pointer"
                    >
                      Connect...
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Schema & Table Explorer */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {!selectedProfileId ? (
                <div className="p-6 text-center text-[#7C8594] text-xs flex-1 flex flex-col items-center justify-center">
                  <span>Select a connection profile from above to get started.</span>
                </div>
              ) : !isConnected ? (
                <div className="p-6 text-center text-[#7C8594] text-xs flex-1 flex flex-col items-center justify-center">
                  <span>Connect to browse schemas and tables.</span>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Schema Selector Bar */}
                  {schemas.length > 0 && (
                    <div className="p-2.5 border-b border-[#303642] bg-[#171A20] flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-mono text-[#7C8594]">Schema:</span>
                      <select
                        value={selectedSchema}
                        onChange={(e) => handleSchemaChange(e.target.value)}
                        className="flex-1 px-2 py-1 bg-[#272D38] border border-[#303642] rounded text-xs text-[#E8EBF1] focus:outline-none focus:border-[#8CA9CF]"
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
                  <div className="p-2 border-b border-[#303642] shrink-0 bg-[#1D2129]">
                    <input
                      type="text"
                      placeholder="Filter tables..."
                      value={tableSearchQuery}
                      onChange={(e) => setTableSearchQuery(e.target.value)}
                      className="w-full px-2.5 py-1 bg-[#272D38] border border-[#303642] rounded text-xs text-[#E8EBF1] placeholder:text-[#7C8594] focus:outline-none focus:border-[#8CA9CF]"
                    />
                  </div>

                  {/* Table List */}
                  <div className="flex-1 overflow-y-auto p-1 divide-y divide-[#303642]/50">
                    {loadingExplorer ? (
                      <div className="p-4 text-center text-[#7C8594] text-xs">
                        Loading schemas and tables...
                      </div>
                    ) : filteredTables.length === 0 ? (
                      <div className="p-4 text-center text-[#7C8594] text-xs">
                        No tables found in schema "{selectedSchema}".
                      </div>
                    ) : (
                      filteredTables.map((tbl) => {
                        const isSelected = selectedTable === tbl.name;
                        return (
                          <button
                            key={tbl.name}
                            onClick={() => handleSelectTable(tbl.name)}
                            className={`w-full text-left px-2.5 py-1.5 rounded text-xs flex items-center justify-between transition-colors cursor-pointer ${
                              isSelected
                                ? "bg-[#35465E] text-[#8CA9CF] font-medium border border-[#8CA9CF]/40 shadow-xs"
                                : "text-[#A5ADBA] hover:bg-[#272D38] hover:text-[#E8EBF1] border border-transparent"
                            }`}
                          >
                            <span className="font-mono truncate">{tbl.name}</span>
                            <span
                              className={`text-[9px] px-1 py-0.5 rounded uppercase font-mono ${
                                tbl.type === "view"
                                  ? "bg-[#8CA9CF]/15 text-[#8CA9CF] border border-[#8CA9CF]/30"
                                  : "bg-[#272D38] text-[#7C8594] border border-[#303642]"
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
          <div className="md:col-span-8 flex flex-col h-full bg-[#1D2129] border border-[#303642] rounded-lg overflow-hidden">
            {/* View Mode Tabs */}
            <div className="flex items-center justify-between px-3 py-2 bg-[#171A20] border-b border-[#303642] shrink-0">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTableTab("query")}
                  className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer ${
                    tableTab === "query"
                      ? "bg-[#35465E] text-[#8CA9CF] font-medium border border-[#8CA9CF]/40 shadow-xs"
                      : "text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38]"
                  }`}
                >
                  SQL Query Editor
                </button>
                <button
                  onClick={() => setTableTab("columns")}
                  disabled={!selectedTable}
                  className={`px-3 py-1 rounded text-xs transition-colors disabled:opacity-40 cursor-pointer ${
                    tableTab === "columns"
                      ? "bg-[#35465E] text-[#8CA9CF] font-medium border border-[#8CA9CF]/40 shadow-xs"
                      : "text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38]"
                  }`}
                >
                  Columns {selectedTable && `(${columns.length})`}
                </button>
                <button
                  onClick={() => setTableTab("sample")}
                  disabled={!selectedTable}
                  className={`px-3 py-1 rounded text-xs transition-colors disabled:opacity-40 cursor-pointer ${
                    tableTab === "sample"
                      ? "bg-[#35465E] text-[#8CA9CF] font-medium border border-[#8CA9CF]/40 shadow-xs"
                      : "text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38]"
                  }`}
                >
                  Sample Data {selectedTable && `(${sampleData?.rows.length || 0})`}
                </button>
              </div>

              {selectedTable && (
                <div className="text-xs text-[#7C8594] font-mono hidden sm:inline">
                  Table: <strong className="text-[#E8EBF1]">{selectedTable}</strong>
                </div>
              )}
            </div>

            {/* Tab 1: SQL Query Editor */}
            {tableTab === "query" && (
              <div className="flex-1 flex flex-col min-h-0 p-4">
                {/* Editor Box */}
                <div className="flex flex-col flex-1 min-h-[160px] max-h-[240px] mb-3">
                  <div className="flex items-center justify-between mb-1.5 text-xs text-[#7C8594]">
                    <span className="font-mono">Read-Only SQL (SELECT statements only)</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSqlQuery("")}
                        className="text-[#7C8594] hover:text-[#E8EBF1] transition-colors cursor-pointer"
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
                    className="flex-1 w-full bg-[#101216] font-mono text-xs text-[#E8EBF1] p-3 border border-[#303642] rounded-md resize-none focus:outline-none focus:border-[#8CA9CF] disabled:opacity-50 leading-relaxed"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-[#7C8594]">
                      Ctrl+Enter or Cmd+Enter to execute.
                    </span>
                    <button
                      onClick={handleRunQuery}
                      disabled={!isConnected || queryExecuting || !sqlQuery.trim()}
                      className="px-4 py-1.5 bg-[#8CA9CF] hover:bg-[#A6BDE0] disabled:bg-[#272D38] disabled:text-[#7C8594] text-[#101216] rounded text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                    >
                      {queryExecuting ? "Executing..." : "Run Query"}
                    </button>
                  </div>
                </div>

                {/* Error Banner */}
                {queryError && (
                  <div className="mb-3 p-2.5 rounded bg-[#E18B8B]/10 border border-[#E18B8B]/40 text-xs text-[#E18B8B] font-mono shrink-0">
                    {queryError}
                  </div>
                )}

                {/* Query Results Table */}
                <div className="flex-1 flex flex-col min-h-0 border border-[#303642] rounded-md overflow-hidden bg-[#101216]">
                  <div className="px-3 py-1.5 bg-[#171A20] border-b border-[#303642] flex items-center justify-between text-xs text-[#7C8594] font-mono shrink-0">
                    <span>
                      Results:{" "}
                      <strong className="text-[#E8EBF1]">
                        {queryResult ? `${queryResult.rowCount} rows` : "No query executed"}
                      </strong>
                    </span>
                    {queryResult && (
                      <div className="flex items-center gap-3">
                        <span>Duration: {queryResult.executionTimeMs}ms</span>
                        {queryResult.truncated && (
                          <span className="text-[#E0B36D]">Truncated (max 500 rows)</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 overflow-auto">
                    {!queryResult ? (
                      <div className="p-8 text-center text-[#7C8594] text-xs">
                        Enter a SELECT query above and click "Run Query" to inspect results.
                      </div>
                    ) : queryResult.rows.length === 0 ? (
                      <div className="p-8 text-center text-[#7C8594] text-xs font-mono">
                        Query returned 0 rows.
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse text-xs font-mono">
                        <thead className="sticky top-0 bg-[#171A20] text-[#7C8594] border-b border-[#303642] shadow-sm">
                          <tr>
                            {queryResult.columns.map((col) => (
                              <th key={col} className="py-2 px-3 whitespace-nowrap font-medium">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#303642]/60 text-[#E8EBF1]">
                          {queryResult.rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-[#272D38]/50 transition-colors">
                              {queryResult.columns.map((col) => (
                                <td key={col} className="py-1.5 px-3 whitespace-nowrap max-w-xs truncate">
                                  {row[col] === null ? (
                                    <span className="text-[#7C8594] italic">NULL</span>
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
                    <tr className="border-b border-[#303642] text-[#7C8594]">
                      <th className="py-2 px-3">Column</th>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3">Nullable</th>
                      <th className="py-2 px-3">Key</th>
                      <th className="py-2 px-3">Default</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#303642] text-[#E8EBF1]">
                    {columns.map((col) => (
                      <tr key={col.name} className="hover:bg-[#272D38]/50">
                        <td className="py-2 px-3 font-semibold text-[#E8EBF1] flex items-center gap-1.5">
                          {col.isPrimaryKey && <span title="Primary Key">🔑</span>}
                          <span>{col.name}</span>
                        </td>
                        <td className="py-2 px-3 text-[#8CA9CF] font-mono text-xs">{col.dataType}</td>
                        <td className="py-2 px-3">
                          {col.isNullable ? (
                            <span className="text-[#A5ADBA]">YES</span>
                          ) : (
                            <span className="text-[#E0B36D] font-medium">NO</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {col.isPrimaryKey ? (
                            <span className="text-[#E0B36D] font-bold">PRIMARY KEY</span>
                          ) : (
                            <span className="text-[#7C8594]">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-[#A5ADBA]">
                          {col.defaultValue || <span className="text-[#7C8594]">-</span>}
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
                  <div className="p-8 text-center text-[#7C8594] text-xs">
                    Table is empty.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead className="sticky top-0 bg-[#171A20] text-[#7C8594] border-b border-[#303642]">
                      <tr>
                        {sampleData.columns.map((col) => (
                          <th key={col} className="py-2 px-3 whitespace-nowrap font-medium">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#303642]/60 text-[#E8EBF1]">
                      {sampleData.rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-[#272D38]/50">
                          {sampleData.columns.map((col) => (
                            <td key={col} className="py-1.5 px-3 whitespace-nowrap max-w-xs truncate">
                              {row[col] === null ? (
                                <span className="text-[#7C8594] italic">NULL</span>
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
        <div className="fixed inset-0 bg-[#101216]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D2129] border border-[#303642] rounded-lg max-w-md w-full p-5 shadow-2xl text-[#E8EBF1]">
            <h3 className="text-base font-semibold text-[#E8EBF1]">
              Connect to {activeProfile?.name}
            </h3>
            <p className="text-xs text-[#A5ADBA] mt-1">
              Enter password for user{" "}
              <strong className="text-[#E8EBF1]">{activeProfile?.username}</strong> on{" "}
              <strong className="text-[#E8EBF1]">{activeProfile?.host}</strong>.
            </p>

            <div className="my-4">
              <label className="text-xs text-[#A5ADBA] font-medium block mb-1">
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
                className="w-full px-3 py-2 bg-[#272D38] border border-[#303642] rounded text-xs text-[#E8EBF1] focus:outline-none focus:border-[#8CA9CF]"
              />
              <span className="text-[10px] text-[#7C8594] mt-1.5 block">
                Held in memory for the active connection. Never saved to disk.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={() => setShowConnectModal(false)}
                className="px-3 py-1.5 text-xs text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] rounded transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteConnect}
                disabled={connecting}
                className="px-4 py-1.5 bg-[#8CA9CF] hover:bg-[#A6BDE0] text-[#101216] rounded text-xs font-semibold transition-colors cursor-pointer"
              >
                {connecting ? "Connecting..." : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create / Edit Profile */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-[#101216]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D2129] border border-[#303642] rounded-lg max-w-lg w-full p-5 shadow-2xl text-[#E8EBF1]">
            <h3 className="text-base font-semibold text-[#E8EBF1] mb-1">
              {editingProfileId ? "Edit Connection Profile" : "New Connection Profile"}
            </h3>
            <p className="text-xs text-[#A5ADBA] mb-4">
              Configure parameters for a PostgreSQL or MySQL database connection.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#A5ADBA] font-medium mb-1">
                  Profile Name:
                </label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) =>
                    setProfileForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g. Local Postgres or Staging MySQL"
                  className="w-full px-3 py-1.5 bg-[#272D38] border border-[#303642] rounded text-[#E8EBF1] focus:outline-none focus:border-[#8CA9CF]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#A5ADBA] font-medium mb-1">
                    Database Engine:
                  </label>
                  <select
                    value={profileForm.type}
                    onChange={(e) =>
                      handleEngineChange(e.target.value as DatabaseEngine)
                    }
                    className="w-full px-3 py-1.5 bg-[#272D38] border border-[#303642] rounded text-[#E8EBF1] focus:outline-none focus:border-[#8CA9CF]"
                  >
                    <option value="postgres">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#A5ADBA] font-medium mb-1">Port:</label>
                  <input
                    type="number"
                    value={profileForm.port}
                    onChange={(e) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        port: parseInt(e.target.value, 10) || 5432,
                      }))
                    }
                    className="w-full px-3 py-1.5 bg-[#272D38] border border-[#303642] rounded text-[#E8EBF1] focus:outline-none focus:border-[#8CA9CF] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#A5ADBA] font-medium mb-1">Host:</label>
                  <input
                    type="text"
                    value={profileForm.host}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, host: e.target.value }))
                    }
                    placeholder="localhost or 127.0.0.1"
                    className="w-full px-3 py-1.5 bg-[#272D38] border border-[#303642] rounded text-[#E8EBF1] focus:outline-none focus:border-[#8CA9CF] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[#A5ADBA] font-medium mb-1">
                    Database Name:
                  </label>
                  <input
                    type="text"
                    value={profileForm.database}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, database: e.target.value }))
                    }
                    placeholder="database_name"
                    className="w-full px-3 py-1.5 bg-[#272D38] border border-[#303642] rounded text-[#E8EBF1] focus:outline-none focus:border-[#8CA9CF] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#A5ADBA] font-medium mb-1">
                    Username:
                  </label>
                  <input
                    type="text"
                    value={profileForm.username}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, username: e.target.value }))
                    }
                    placeholder="postgres or root"
                    className="w-full px-3 py-1.5 bg-[#272D38] border border-[#303642] rounded text-[#E8EBF1] focus:outline-none focus:border-[#8CA9CF] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[#A5ADBA] font-medium mb-1">
                    Password (for testing):
                  </label>
                  <input
                    type="password"
                    value={profileFormPassword}
                    onChange={(e) => setProfileFormPassword(e.target.value)}
                    placeholder="Optional for test"
                    className="w-full px-3 py-1.5 bg-[#272D38] border border-[#303642] rounded text-[#E8EBF1] focus:outline-none focus:border-[#8CA9CF]"
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
                  className="rounded border-[#303642] bg-[#272D38] text-[#8CA9CF] focus:ring-0 cursor-pointer"
                />
                <label htmlFor={`${baseId}-ssl-check`} className="text-[#A5ADBA] cursor-pointer">
                  Enable SSL / TLS connection
                </label>
              </div>

              {formTestResult && (
                <div className="p-2.5 rounded bg-[#101216] border border-[#303642] text-[11px] font-mono text-[#E8EBF1]">
                  {formTestResult}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-6 pt-3 border-t border-[#303642]">
              <button
                type="button"
                onClick={handleTestFromModal}
                disabled={formTestLoading}
                className="px-3 py-1.5 text-xs text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] border border-[#303642] rounded transition-colors cursor-pointer"
              >
                {formTestLoading ? "Testing..." : "Test Connection"}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="px-3 py-1.5 text-xs text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] rounded transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  className="px-4 py-1.5 bg-[#8CA9CF] hover:bg-[#A6BDE0] text-[#101216] rounded text-xs font-semibold transition-colors cursor-pointer"
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
