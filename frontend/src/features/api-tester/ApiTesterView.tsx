"use client";

import { useEffect, useId, useRef, useState, useCallback } from "react";
import {
  cancelApiRequest,
  executeApiRequest,
  fetchDiscoveredProjectApis,
  fetchDiscoveredApisByPath,
} from "@/services/apiTester";
import { fetchWorkspaces } from "@/services/projects";
import { useWorkspaceSubscription } from "@/services/workspaceSync";
import { WorkspaceWithProjects } from "@/types/project";
import { DiscoveredApiEndpoint } from "@/types/apiDiscovery";
import {
  ApiTesterRequest,
  ApiTesterResponseResult,
  HttpMethod,
  KeyValuePair,
} from "@/types/apiTester";
import { ApiCatalogSidebar } from "./ApiCatalogSidebar";
import { ApiEndpointDetailsModal } from "./ApiEndpointDetailsModal";

const HTTP_METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

function getMethodColor(method: HttpMethod): string {
  switch (method) {
    case "GET":
      return "text-cyan-400 border-cyan-800/60 bg-cyan-950/40";
    case "POST":
      return "text-emerald-400 border-emerald-800/60 bg-emerald-950/40";
    case "PUT":
      return "text-amber-400 border-amber-800/60 bg-amber-950/40";
    case "PATCH":
      return "text-violet-400 border-violet-800/60 bg-violet-950/40";
    case "DELETE":
      return "text-rose-400 border-rose-800/60 bg-rose-950/40";
    case "HEAD":
    case "OPTIONS":
    default:
      return "text-zinc-400 border-zinc-700 bg-zinc-800/40";
  }
}

function getStatusBadgeClass(status: number): string {
  if (status >= 200 && status < 300) {
    return "bg-emerald-950/70 text-emerald-300 border-emerald-800/60";
  }
  if (status >= 300 && status < 400) {
    return "bg-cyan-950/70 text-cyan-300 border-cyan-800/60";
  }
  if (status >= 400 && status < 500) {
    return "bg-amber-950/70 text-amber-300 border-amber-800/60";
  }
  if (status >= 500) {
    return "bg-rose-950/70 text-rose-300 border-rose-800/60";
  }
  return "bg-zinc-800 text-zinc-300 border-zinc-700";
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

interface ApiTesterViewProps {
  initialSelection?: {
    workspaceId?: string;
    projectId?: string;
  } | null;
}

export function ApiTesterView({ initialSelection }: ApiTesterViewProps = {}) {
  const baseId = useId();
  const isMountedRef = useRef<boolean>(true);

  // Workspace & Project State
  const [workspaces, setWorkspaces] = useState<WorkspaceWithProjects[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(
    initialSelection?.workspaceId || ""
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    initialSelection?.projectId || ""
  );
  const [baseUrl, setBaseUrl] = useState<string>("http://localhost:5001");

  // Keep workspaces updated via subscription
  useWorkspaceSubscription(setWorkspaces);

  // Discovered APIs State
  const [discoveredEndpoints, setDiscoveredEndpoints] = useState<
    DiscoveredApiEndpoint[]
  >([]);
  const [loadingApis, setLoadingApis] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [activeEndpointId, setActiveEndpointId] = useState<string | null>(null);
  const [analyzingEndpoint, setAnalyzingEndpoint] =
    useState<DiscoveredApiEndpoint | null>(null);

  // Request Configuration State
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState<string>("http://localhost:5001/health");
  const [requestTab, setRequestTab] = useState<"params" | "headers" | "body">(
    "params"
  );

  const [params, setParams] = useState<KeyValuePair[]>([
    { id: `${baseId}-p-1`, key: "", value: "", enabled: true },
  ]);

  const [headers, setHeaders] = useState<KeyValuePair[]>([
    {
      id: `${baseId}-h-1`,
      key: "Content-Type",
      value: "application/json",
      enabled: true,
    },
    {
      id: `${baseId}-h-2`,
      key: "Accept",
      value: "application/json",
      enabled: true,
    },
  ]);

  const [body, setBody] = useState<string>("");

  // Response & Execution State
  const [loading, setLoading] = useState<boolean>(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [response, setResponse] = useState<ApiTesterResponseResult | null>(null);
  const [responseTab, setResponseTab] = useState<"body" | "headers">("body");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);

  // 1. Initial Load: Workspaces & Restoring Selection
  useEffect(() => {
    isMountedRef.current = true;

    async function loadWorkspaces() {
      try {
        const loaded = await fetchWorkspaces();
        if (!isMountedRef.current) return;
        setWorkspaces(loaded);

        const savedWs = localStorage.getItem("devdesk_apitester_last_workspace_id");
        const savedProj = localStorage.getItem("devdesk_apitester_last_project_id");

        if (initialSelection?.workspaceId) {
          setSelectedWorkspaceId(initialSelection.workspaceId);
          setSelectedProjectId(initialSelection.projectId || "");
        } else if (savedWs && loaded.some((w) => w.id === savedWs)) {
          setSelectedWorkspaceId(savedWs);
          const ws = loaded.find((w) => w.id === savedWs);
          if (savedProj && ws?.projects.some((p) => p.id === savedProj)) {
            setSelectedProjectId(savedProj);
          } else if (ws && ws.projects.length > 0) {
            setSelectedProjectId(ws.projects[0].id);
          }
        } else if (loaded.length > 0) {
          setSelectedWorkspaceId(loaded[0].id);
          if (loaded[0].projects.length > 0) {
            setSelectedProjectId(loaded[0].projects[0].id);
          }
        }
      } catch {
        // non-fatal
      }
    }

    loadWorkspaces();

    return () => {
      isMountedRef.current = false;
    };
  }, [initialSelection]);

  const activeWorkspace =
    workspaces.find((w) => w.id === selectedWorkspaceId) || null;
  const availableProjects = activeWorkspace?.projects || [];
  const activeProject =
    availableProjects.find((p) => p.id === selectedProjectId) || null;

  // Reconcile project when workspace changes
  useEffect(() => {
    if (activeWorkspace && activeWorkspace.projects.length > 0) {
      if (
        !selectedProjectId ||
        !activeWorkspace.projects.some((p) => p.id === selectedProjectId)
      ) {
        setSelectedProjectId(activeWorkspace.projects[0].id);
      }
    } else {
      setSelectedProjectId("");
    }
  }, [selectedWorkspaceId, activeWorkspace, selectedProjectId]);

  // Persist last selected workspace and project
  useEffect(() => {
    if (selectedWorkspaceId && typeof window !== "undefined") {
      localStorage.setItem("devdesk_apitester_last_workspace_id", selectedWorkspaceId);
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (selectedProjectId && typeof window !== "undefined") {
      localStorage.setItem("devdesk_apitester_last_project_id", selectedProjectId);
    }
  }, [selectedProjectId]);

  // 2. Discover APIs for Selected Project
  const scanProjectApis = useCallback(
    async (projId: string) => {
      if (!projId) {
        setDiscoveredEndpoints([]);
        return;
      }

      try {
        setLoadingApis(true);
        const result = await fetchDiscoveredProjectApis(projId);
        if (!isMountedRef.current) return;

        setDiscoveredEndpoints(result.endpoints);

        if (result.baseUrlSuggestion) {
          setBaseUrl(result.baseUrlSuggestion);
        }
      } catch (err: unknown) {
        if (!isMountedRef.current) return;
        // Fallback: if project not in DB, try scanning path directly
        if (activeProject?.path) {
          try {
            const fallback = await fetchDiscoveredApisByPath(
              activeProject.path,
              activeProject.name
            );
            if (!isMountedRef.current) return;
            setDiscoveredEndpoints(fallback.endpoints);
            if (fallback.baseUrlSuggestion) {
              setBaseUrl(fallback.baseUrlSuggestion);
            }
            return;
          } catch {
            // ignore fallback
          }
        }
        console.warn("Failed to discover APIs:", err);
      } finally {
        if (isMountedRef.current) {
          setLoadingApis(false);
        }
      }
    },
    [activeProject]
  );

  // Trigger scan whenever selected project changes
  useEffect(() => {
    if (selectedProjectId) {
      scanProjectApis(selectedProjectId);
    } else {
      setDiscoveredEndpoints([]);
    }
  }, [selectedProjectId, scanProjectApis]);

  // 3. One-Click Load Endpoint into Tester
  const handleLoadEndpointIntoTester = useCallback(
    (endpoint: DiscoveredApiEndpoint, customBaseUrl?: string) => {
      const activeBase = (customBaseUrl || baseUrl).replace(/\/+$/, "");
      const fullUrl = `${activeBase}${endpoint.path}`;

      setMethod(endpoint.method);
      setUrl(fullUrl);
      setActiveEndpointId(endpoint.id);

      // Pre-fill query params
      if (endpoint.queryParams.length > 0) {
        setParams(
          endpoint.queryParams.map((qp, idx) => ({
            id: `p-${Date.now()}-${idx}`,
            key: qp.name,
            value: qp.sampleValue || "",
            enabled: true,
          }))
        );
        setRequestTab("params");
      } else {
        setParams([{ id: `p-${Date.now()}`, key: "", value: "", enabled: true }]);
      }

      // Pre-fill headers
      if (endpoint.headers && endpoint.headers.length > 0) {
        setHeaders(
          endpoint.headers.map((h, idx) => ({
            id: `h-${Date.now()}-${idx}`,
            key: h.key,
            value: h.value,
            enabled: true,
          }))
        );
      }

      // Pre-fill body for POST/PUT/PATCH/DELETE
      if (
        ["POST", "PUT", "PATCH", "DELETE"].includes(endpoint.method) &&
        endpoint.requestBody?.sampleJson
      ) {
        setBody(endpoint.requestBody.sampleJson);
        setRequestTab("body");
      } else if (!["POST", "PUT", "PATCH", "DELETE"].includes(endpoint.method)) {
        setBody("");
      }
    },
    [baseUrl]
  );

  // Helper: check JSON validity of body
  let jsonValidation: { valid: boolean; error?: string } = { valid: true };
  if (body.trim().length > 0) {
    try {
      JSON.parse(body);
      jsonValidation = { valid: true };
    } catch (err: unknown) {
      jsonValidation = {
        valid: false,
        error: (err as Error).message,
      };
    }
  }

  // Parameter Row Handlers
  function addParamRow() {
    setParams((prev) => [
      ...prev,
      { id: `${baseId}-p-${Date.now()}`, key: "", value: "", enabled: true },
    ]);
  }

  function updateParamRow(
    id: string,
    field: "key" | "value" | "enabled",
    val: unknown
  ) {
    setParams((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: val } : row))
    );
  }

  function removeParamRow(id: string) {
    setParams((prev) => prev.filter((row) => row.id !== id));
  }

  // Header Row Handlers
  function addHeaderRow() {
    setHeaders((prev) => [
      ...prev,
      { id: `${baseId}-h-${Date.now()}`, key: "", value: "", enabled: true },
    ]);
  }

  function updateHeaderRow(
    id: string,
    field: "key" | "value" | "enabled",
    val: unknown
  ) {
    setHeaders((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: val } : row))
    );
  }

  function removeHeaderRow(id: string) {
    setHeaders((prev) => prev.filter((row) => row.id !== id));
  }

  // Format Body JSON
  function handleFormatJson() {
    if (!body.trim()) return;
    try {
      const parsed = JSON.parse(body);
      setBody(JSON.stringify(parsed, null, 2));
    } catch {
      // ignore
    }
  }

  // Send Request
  async function handleSendRequest() {
    if (!url.trim()) {
      setErrorMessage("Please enter a valid request URL");
      return;
    }

    const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setCurrentRequestId(reqId);
    setLoading(true);
    setErrorMessage(null);

    const payload: ApiTesterRequest = {
      requestId: reqId,
      method,
      url: url.trim(),
      params: params.filter((p) => p.key.trim().length > 0 && p.enabled),
      headers: headers.filter((h) => h.key.trim().length > 0 && h.enabled),
      body: ["POST", "PUT", "PATCH", "DELETE"].includes(method) ? body : undefined,
      timeoutMs: 30000,
    };

    try {
      const res = await executeApiRequest(payload);
      setResponse(res);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to execute request"
      );
    } finally {
      setLoading(false);
      setCurrentRequestId(null);
    }
  }

  // Cancel Request
  async function handleCancelRequest() {
    if (!currentRequestId) return;
    try {
      await cancelApiRequest(currentRequestId);
      setErrorMessage("Request was cancelled");
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
      setCurrentRequestId(null);
    }
  }

  // Clear Response
  function handleClearResponse() {
    setResponse(null);
    setErrorMessage(null);
  }

  // Copy Response Body
  function handleCopyBody() {
    if (!response?.body) return;
    navigator.clipboard.writeText(response.body);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }

  function getFormattedResponseBody(): string {
    if (!response) return "";
    if (response.isJson) {
      try {
        const parsed = JSON.parse(response.body);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return response.body;
      }
    }
    return response.body;
  }

  const allowsBody = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  return (
    <div className="flex flex-col h-full text-zinc-100 w-full overflow-hidden">
      {/* 1. Header Toolbar with Workspace, Project, and Base URL Selectors */}
      <div className="p-4 sm:px-6 sm:py-3.5 border-b border-zinc-800 bg-zinc-950/70 shrink-0 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">API Tester &amp; Discovery</h2>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
              Auto-Scanner &amp; Inspector
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Automatically discover project API endpoints, analyze request/response schemas, and test live RESTful calls.
          </p>
        </div>

        {/* Project Context & Base URL Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Workspace Selector */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-zinc-400 font-medium">
              Workspace:
            </label>
            <select
              value={selectedWorkspaceId}
              onChange={(e) => {
                setSelectedWorkspaceId(e.target.value);
                setSelectedProjectId("");
              }}
              className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 max-w-[160px] truncate"
            >
              <option value="">(Select Workspace)</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.rootPath.split("/").pop() || ws.rootPath}
                </option>
              ))}
            </select>
          </div>

          {/* Project Selector */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-zinc-400 font-medium">
              Project:
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              disabled={availableProjects.length === 0}
              className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 max-w-[180px] truncate"
            >
              <option value="">(Select Project)</option>
              {availableProjects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.displayName || proj.name} ({proj.type})
                </option>
              ))}
            </select>
          </div>

          {/* Base URL Input */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-zinc-400 font-medium font-mono">
              Base URL:
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:5001"
              className="w-40 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-md text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Toggle Catalog Sidebar Button */}
          <button
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition flex items-center gap-1.5 cursor-pointer shadow-xs ${
              !sidebarCollapsed
                ? "bg-zinc-800 text-cyan-400 border-cyan-800/80"
                : "text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border-zinc-700"
            }`}
            title="Toggle API Catalog sidebar"
          >
            <span>📑</span>
            <span>APIs ({discoveredEndpoints.length})</span>
          </button>
        </div>
      </div>

      {/* 2. Main Body: Split between API Catalog Sidebar & Active Request Workspace */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
        {/* Left: Discovered API Catalog Sidebar */}
        <ApiCatalogSidebar
          endpoints={discoveredEndpoints}
          loading={loadingApis}
          onRefresh={() => {
            if (selectedProjectId) {
              scanProjectApis(selectedProjectId);
            }
          }}
          onSelectEndpoint={handleLoadEndpointIntoTester}
          onAnalyzeEndpoint={(ep) => setAnalyzingEndpoint(ep)}
          activeEndpointId={activeEndpointId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        />

        {/* Right: API Request Composer & Response Viewer */}
        <div className="flex-1 flex flex-col h-full min-h-0 p-4 sm:p-5 overflow-hidden">
          {/* Main Request Bar: Method + URL + Send/Cancel/Clear */}
          <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 flex flex-wrap items-center gap-2.5 shadow-sm mb-4 shrink-0">
            {/* Method Selector */}
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as HttpMethod)}
              disabled={loading}
              className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold border focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all cursor-pointer ${getMethodColor(
                method
              )}`}
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m} className="bg-zinc-950 text-zinc-100">
                  {m}
                </option>
              ))}
            </select>

            {/* URL Input */}
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) {
                  handleSendRequest();
                }
              }}
              disabled={loading}
              placeholder="http://localhost:5001/api/... or https://..."
              className="flex-1 min-w-[240px] px-3.5 py-1.5 text-xs font-mono rounded-md bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all"
            />

            {/* Controls: Send / Cancel / Clear */}
            <div className="flex items-center gap-2">
              {!loading ? (
                <button
                  onClick={handleSendRequest}
                  disabled={loading || !url.trim()}
                  className="px-4 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <span>Send</span>
                </button>
              ) : (
                <button
                  onClick={handleCancelRequest}
                  className="px-4 py-1.5 rounded-md text-xs font-semibold bg-rose-600 text-white hover:bg-rose-500 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <span className="w-2 h-2 rounded-full border border-white border-t-transparent animate-spin" />
                  <span>Cancel</span>
                </button>
              )}

              <button
                onClick={handleClearResponse}
                disabled={!response && !errorMessage}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white disabled:opacity-40 transition-all cursor-pointer"
                title="Clear current response"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Error notification banner */}
          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-rose-950/50 border border-rose-900/60 text-rose-300 text-xs flex items-center justify-between gap-3 animate-in fade-in shrink-0">
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span>{errorMessage}</span>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-zinc-400 hover:text-zinc-200 px-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Middle & Bottom Split: Request Builder & Response Viewer */}
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* LEFT PANEL: Request Configuration (Params / Headers / Body) */}
            <div className="flex flex-col min-h-0 rounded-lg bg-zinc-950 border border-zinc-800 shadow-md overflow-hidden">
              {/* Request Tabs Header */}
              <div className="px-4 py-2 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between text-xs select-none shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRequestTab("params")}
                    className={`px-3 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                      requestTab === "params"
                        ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Params ({params.filter((p) => p.key.trim().length > 0).length})
                  </button>
                  <button
                    onClick={() => setRequestTab("headers")}
                    className={`px-3 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                      requestTab === "headers"
                        ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Headers ({headers.filter((h) => h.key.trim().length > 0).length})
                  </button>
                  <button
                    onClick={() => setRequestTab("body")}
                    className={`px-3 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                      requestTab === "body"
                        ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Body {body.trim() ? "●" : ""}
                  </button>
                </div>

                {requestTab === "params" && (
                  <button
                    onClick={addParamRow}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
                  >
                    + Add Param
                  </button>
                )}

                {requestTab === "headers" && (
                  <button
                    onClick={addHeaderRow}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
                  >
                    + Add Header
                  </button>
                )}

                {requestTab === "body" && allowsBody && (
                  <div className="flex items-center gap-2">
                    {body.trim().length > 0 && (
                      <span
                        className={`text-[11px] font-mono ${
                          jsonValidation.valid ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {jsonValidation.valid ? "✓ JSON" : "✕ Invalid JSON"}
                      </span>
                    )}
                    <button
                      onClick={handleFormatJson}
                      disabled={!body.trim() || !jsonValidation.valid}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      Prettify
                    </button>
                  </div>
                )}
              </div>

              {/* Request Tab Contents */}
              <div className="flex-1 overflow-auto p-3">
                {/* TAB 1: PARAMS */}
                {requestTab === "params" && (
                  <div className="space-y-2">
                    {params.map((row) => (
                      <div key={row.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={(e) =>
                            updateParamRow(row.id, "enabled", e.target.checked)
                          }
                          className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={row.key}
                          onChange={(e) =>
                            updateParamRow(row.id, "key", e.target.value)
                          }
                          placeholder="Parameter Key"
                          className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                        />
                        <input
                          type="text"
                          value={row.value}
                          onChange={(e) =>
                            updateParamRow(row.id, "value", e.target.value)
                          }
                          placeholder="Value"
                          className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                        />
                        <button
                          onClick={() => removeParamRow(row.id)}
                          className="px-2 py-1 text-zinc-500 hover:text-rose-400 text-xs transition-colors cursor-pointer"
                          title="Remove parameter"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* TAB 2: HEADERS */}
                {requestTab === "headers" && (
                  <div className="space-y-2">
                    {headers.map((row) => (
                      <div key={row.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={(e) =>
                            updateHeaderRow(row.id, "enabled", e.target.checked)
                          }
                          className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={row.key}
                          onChange={(e) =>
                            updateHeaderRow(row.id, "key", e.target.value)
                          }
                          placeholder="Header Name"
                          className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                        />
                        <input
                          type="text"
                          value={row.value}
                          onChange={(e) =>
                            updateHeaderRow(row.id, "value", e.target.value)
                          }
                          placeholder="Value"
                          className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                        />
                        <button
                          onClick={() => removeHeaderRow(row.id)}
                          className="px-2 py-1 text-zinc-500 hover:text-rose-400 text-xs transition-colors cursor-pointer"
                          title="Remove header"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* TAB 3: BODY */}
                {requestTab === "body" && (
                  <div className="h-full flex flex-col">
                    {!allowsBody ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 p-6">
                        <p className="text-xs">
                          HTTP {method} requests do not carry a request body according to HTTP specifications.
                        </p>
                        <p className="text-[11px] text-zinc-600 mt-1">
                          Switch to POST, PUT, PATCH, or DELETE to supply a payload.
                        </p>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col h-full">
                        <textarea
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          placeholder='{\n  "key": "value"\n}'
                          rows={12}
                          className="flex-1 w-full p-3 font-mono text-xs rounded bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 resize-none"
                        />
                        {!jsonValidation.valid && (
                          <p className="text-[11px] text-rose-400 mt-1 font-mono">
                            {jsonValidation.error}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT PANEL: Response Viewer */}
            <div className="flex flex-col min-h-0 rounded-lg bg-zinc-950 border border-zinc-800 shadow-md overflow-hidden">
              {/* Response Status Bar */}
              <div className="px-4 py-2 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between text-xs select-none shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setResponseTab("body")}
                    className={`px-3 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                      responseTab === "body"
                        ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Response Body
                  </button>
                  <button
                    onClick={() => setResponseTab("headers")}
                    className={`px-3 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                      responseTab === "headers"
                        ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Headers ({response ? Object.keys(response.headers).length : 0})
                  </button>
                </div>

                {/* Metadata (Status, Time, Size) */}
                {response && (
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold border shadow-sm ${getStatusBadgeClass(
                        response.status
                      )}`}
                    >
                      {response.status} {response.statusText}
                    </span>

                    <span className="text-zinc-400">{response.durationMs} ms</span>
                    <span className="text-zinc-400">{formatBytes(response.sizeBytes)}</span>

                    {response.isTruncated && (
                      <span className="text-amber-400 text-[10px] font-semibold uppercase">
                        Truncated
                      </span>
                    )}

                    <button
                      onClick={handleCopyBody}
                      disabled={!response.body}
                      className="px-2 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer"
                      title="Copy body to clipboard"
                    >
                      {copyFeedback ? "Copied!" : "Copy"}
                    </button>
                  </div>
                )}
              </div>

              {/* Response Content View */}
              <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed">
                {loading ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500">
                    <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-zinc-300 animate-spin mb-3" />
                    <p className="text-sm font-medium text-zinc-300">Sending HTTP request...</p>
                    <p className="text-xs text-zinc-500 mt-1">Awaiting response from target server</p>
                  </div>
                ) : !response ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 p-8">
                    <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm font-mono text-zinc-400 mb-4 shadow-sm">
                      ⚡
                    </div>
                    <p className="text-sm font-semibold text-zinc-200">No Request Sent Yet</p>
                    <p className="text-xs text-zinc-400 mt-1 max-w-sm leading-relaxed">
                      Select any discovered API from the left sidebar or enter an endpoint URL to test responses, headers, and schemas.
                    </p>

                    {/* Quick Presets */}
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                      <button
                        onClick={() => {
                          setMethod("GET");
                          setUrl("http://localhost:5001/health");
                        }}
                        className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors cursor-pointer"
                      >
                        Backend Health (GET)
                      </button>
                      <button
                        onClick={() => {
                          setMethod("GET");
                          setUrl("http://localhost:5001/api/workspaces");
                        }}
                        className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors cursor-pointer"
                      >
                        Workspaces (GET)
                      </button>
                      <button
                        onClick={() => {
                          setMethod("GET");
                          setUrl("http://localhost:5001/api/processes");
                        }}
                        className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors cursor-pointer"
                      >
                        Processes (GET)
                      </button>
                    </div>
                  </div>
                ) : responseTab === "body" ? (
                  /* TAB 1: RESPONSE BODY */
                  <div className="h-full select-text">
                    {!response.body ? (
                      <div className="h-full flex items-center justify-center text-zinc-500 italic">
                        (Empty response body)
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap text-zinc-300">
                        {getFormattedResponseBody()}
                      </pre>
                    )}
                  </div>
                ) : (
                  /* TAB 2: RESPONSE HEADERS */
                  <div className="select-text">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-500 font-mono text-[11px] uppercase">
                          <th className="py-2 px-3 font-semibold">Header</th>
                          <th className="py-2 px-3 font-semibold">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {Object.entries(response.headers).map(([key, value]) => (
                          <tr key={key} className="hover:bg-zinc-900/40">
                            <td className="py-2 px-3 text-cyan-400 font-medium font-mono">{key}</td>
                            <td className="py-2 px-3 text-zinc-300 font-mono break-all">{value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Modal: Deep-dive API Endpoint Specification & Analysis */}
      {analyzingEndpoint && (
        <ApiEndpointDetailsModal
          endpoint={analyzingEndpoint}
          baseUrl={baseUrl}
          onClose={() => setAnalyzingEndpoint(null)}
          onLoadIntoTester={handleLoadEndpointIntoTester}
        />
      )}
    </div>
  );
}
