"use client";

import { useEffect, useId, useMemo, useRef, useState, useCallback } from "react";
import {
  cancelApiRequest,
  executeApiRequest,
  fetchDiscoveredProjectApis,
  fetchDiscoveredApisByPath,
  fetchProjectsWithApis,
  ProjectApiSummary,
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
import { BACKEND_URL } from "@/config/env";
import { ApiCatalogSidebar } from "./ApiCatalogSidebar";
import { ApiEndpointDetailsModal } from "./ApiEndpointDetailsModal";
import {
  resolveSampleUrl,
  generateRealisticRequestBody,
  generateRealisticResponseExample,
  generateRealisticQueryParams,
  generateRealisticHeaders,
  generateCompleteApiExample,
} from "./apiExampleGenerator";

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
  const [baseUrl, setBaseUrl] = useState<string>(BACKEND_URL);

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
  const [url, setUrl] = useState<string>(`${BACKEND_URL}/health`);
  const [requestTab, setRequestTab] = useState<
    "params" | "headers" | "body" | "example"
  >("example");

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

  // Projects with APIs Summary & Filtering
  const [projectsSummary, setProjectsSummary] = useState<ProjectApiSummary[]>([]);
  const [, setLoadingProjectsSummary] = useState<boolean>(false);
  const [filterOnlyWithApis, setFilterOnlyWithApis] = useState<boolean>(true);

  // Response & Execution State
  const [loading, setLoading] = useState<boolean>(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [response, setResponse] = useState<ApiTesterResponseResult | null>(null);
  const [responseTab, setResponseTab] = useState<"body" | "headers">("body");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);

  // Expected Response Example state & Mode
  const [expectedResponse, setExpectedResponse] = useState<{
    statusCode: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
  } | null>(() => {
    return generateRealisticResponseExample("GET", `${BACKEND_URL}/health`);
  });
  const [responseViewMode, setResponseViewMode] = useState<"example" | "live">("example");

  // Synchronize expected response when method or URL changes without a live response
  useEffect(() => {
    if (!response) {
      setExpectedResponse(generateRealisticResponseExample(method, url));
    }
  }, [method, url, response]);

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

  // Load project API summary whenever workspace changes
  useEffect(() => {
    let active = true;
    async function loadSummary() {
      if (!selectedWorkspaceId) {
        setProjectsSummary([]);
        return;
      }
      try {
        setLoadingProjectsSummary(true);
        const list = await fetchProjectsWithApis(selectedWorkspaceId);
        if (active) {
          setProjectsSummary(list);
        }
      } catch {
        // non-fatal
      } finally {
        if (active) setLoadingProjectsSummary(false);
      }
    }
    loadSummary();
    return () => {
      active = false;
    };
  }, [selectedWorkspaceId]);

  const activeWorkspace =
    workspaces.find((w) => w.id === selectedWorkspaceId) || null;
  const availableProjects = activeWorkspace?.projects || [];

  // Filter projects to only those that have discovered APIs if filterOnlyWithApis is active
  const displayedProjects = useMemo(() => {
    if (!filterOnlyWithApis) {
      return availableProjects;
    }
    if (projectsSummary.length > 0) {
      const apiProjectIds = new Set(
        projectsSummary.filter((p) => p.hasApis).map((p) => p.id)
      );
      const filtered = availableProjects.filter((p) => apiProjectIds.has(p.id));
      return filtered.length > 0 ? filtered : availableProjects;
    }
    // Fallback heuristic while summary loads: prioritize backend/api/server/node
    const probable = availableProjects.filter((p) => {
      const t = (p.type || "").toLowerCase();
      const n = (p.name || "").toLowerCase();
      return (
        t === "backend" ||
        t === "service" ||
        t === "api" ||
        t === "fullstack" ||
        t === "node.js / express" ||
        n.includes("backend") ||
        n.includes("server") ||
        n.includes("api")
      );
    });
    return probable.length > 0 ? probable : availableProjects;
  }, [availableProjects, filterOnlyWithApis, projectsSummary]);

  const activeProject =
    availableProjects.find((p) => p.id === selectedProjectId) || null;

  // Reconcile project when displayed projects change
  useEffect(() => {
    if (displayedProjects.length > 0) {
      if (
        !selectedProjectId ||
        !displayedProjects.some((p) => p.id === selectedProjectId)
      ) {
        setSelectedProjectId(displayedProjects[0].id);
      }
    } else if (availableProjects.length > 0 && !filterOnlyWithApis) {
      setSelectedProjectId(availableProjects[0].id);
    } else {
      setSelectedProjectId("");
    }
  }, [displayedProjects, availableProjects, filterOnlyWithApis, selectedProjectId]);

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

  // 3. One-Click Load Endpoint into Tester with Complete Example (URL, Params, Headers, Body, Expected Response)
  const handleLoadEndpointIntoTester = useCallback(
    (
      endpoint: DiscoveredApiEndpoint,
      customBaseUrl?: string,
      targetTab: "params" | "headers" | "body" | "example" = "example"
    ) => {
      const activeBase = (customBaseUrl || baseUrl).replace(/\/+$/, "");
      const fullExample = generateCompleteApiExample(
        endpoint.method,
        endpoint.path,
        activeBase,
        endpoint
      );

      setMethod(fullExample.method);
      setUrl(fullExample.url);
      setActiveEndpointId(endpoint.id);
      setParams(fullExample.params);
      setHeaders(fullExample.headers);
      setBody(fullExample.body);
      setExpectedResponse(fullExample.response);
      setResponseViewMode("example");
      setRequestTab(targetTab);
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
      setResponseViewMode("live");
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
    setResponseViewMode("example");
  }

  // Copy Response Body (Live or Example)
  function handleCopyResponseBody() {
    const textToCopy =
      responseViewMode === "live" && response
        ? getFormattedResponseBody()
        : expectedResponse?.body || "";
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }

  // Insert intelligent example body for current route & method
  function handleInsertExampleBody() {
    const sample = generateRealisticRequestBody(method, url);
    setBody(sample);
    setRequestTab("body");
  }

  // Select Quick Preset
  function handleSelectPreset(presetMethod: HttpMethod, presetUrl: string) {
    setMethod(presetMethod);
    setUrl(presetUrl);
    setExpectedResponse(generateRealisticResponseExample(presetMethod, presetUrl));
    setResponseViewMode("example");
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
              disabled={displayedProjects.length === 0}
              className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 max-w-[200px] truncate"
            >
              <option value="">
                {displayedProjects.length === 0
                  ? "(No API Projects)"
                  : "(Select Project)"}
              </option>
              {displayedProjects.map((proj) => {
                const summary = projectsSummary.find((s) => s.id === proj.id);
                const countBadge =
                  summary && summary.endpointsCount > 0
                    ? ` (${summary.endpointsCount} APIs)`
                    : ` (${proj.type})`;
                return (
                  <option key={proj.id} value={proj.id}>
                    {proj.displayName || proj.name}
                    {countBadge}
                  </option>
                );
              })}
            </select>

            {/* Toggle APIs Only filter pill */}
            <button
              type="button"
              onClick={() => setFilterOnlyWithApis((prev) => !prev)}
              className={`px-2 py-1 rounded-md text-xs font-medium border transition flex items-center gap-1 cursor-pointer shrink-0 ${
                filterOnlyWithApis
                  ? "bg-emerald-950/70 text-emerald-300 border-emerald-800/80"
                  : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-zinc-200"
              }`}
              title={
                filterOnlyWithApis
                  ? "Currently showing only projects with APIs. Click to show all projects."
                  : "Currently showing all projects. Click to show only projects with APIs."
              }
            >
              <span>{filterOnlyWithApis ? "✓" : "○"}</span>
              <span>APIs Only</span>
              {projectsSummary.length > 0 && (
                <span className="text-[10px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono">
                  {projectsSummary.filter((p) => p.hasApis).length}/{availableProjects.length}
                </span>
              )}
            </button>
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
              placeholder={BACKEND_URL}
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
              placeholder={`${BACKEND_URL}/api/... or https://...`}
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
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setRequestTab("example")}
                    className={`px-2.5 py-1 rounded-md font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                      requestTab === "example"
                        ? "bg-emerald-950 text-emerald-300 shadow-sm border border-emerald-700/80"
                        : "text-emerald-400 hover:text-emerald-200 hover:bg-emerald-950/40 border border-emerald-900/40"
                    }`}
                  >
                    <span>✨</span>
                    <span>Complete Example</span>
                  </button>
                  <button
                    onClick={() => setRequestTab("params")}
                    className={`px-2.5 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                      requestTab === "params"
                        ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Params ({params.filter((p) => p.key.trim().length > 0).length})
                  </button>
                  <button
                    onClick={() => setRequestTab("headers")}
                    className={`px-2.5 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                      requestTab === "headers"
                        ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Headers ({headers.filter((h) => h.key.trim().length > 0).length})
                  </button>
                  <button
                    onClick={() => setRequestTab("body")}
                    className={`px-2.5 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                      requestTab === "body"
                        ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Body {body.trim() ? "●" : ""}
                  </button>
                </div>

                {requestTab === "example" && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (allowsBody && body.trim()) {
                          setRequestTab("body");
                        } else if (params.some((p) => p.key.trim())) {
                          setRequestTab("params");
                        } else {
                          setRequestTab("headers");
                        }
                      }}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      type="button"
                      onClick={handleSendRequest}
                      disabled={loading}
                      className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                    >
                      🚀 Run Live
                    </button>
                  </div>
                )}

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
                    <button
                      type="button"
                      onClick={handleInsertExampleBody}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 hover:bg-cyan-900/80 hover:text-cyan-200 transition-colors cursor-pointer"
                      title="Insert realistic example payload for this endpoint"
                    >
                      ✨ Insert Example
                    </button>
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
              <div className="flex-1 overflow-auto no-scrollbar p-3">
                {/* TAB 0: COMPLETE EXAMPLE BLUEPRINT */}
                {requestTab === "example" && (
                  <div className="space-y-3.5 select-text">
                    {/* Header Banner */}
                    <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">✨</span>
                        <div>
                          <p className="font-semibold text-emerald-200 text-xs">
                            Complete Request &amp; Response Example
                          </p>
                          <p className="text-[11px] text-emerald-300/80 mt-0.5">
                            Pre-configured parameters, headers, body, and schema for this endpoint.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (allowsBody && body.trim()) setRequestTab("body");
                            else if (params.some((p) => p.key.trim())) setRequestTab("params");
                            else setRequestTab("headers");
                          }}
                          className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-zinc-700 transition cursor-pointer"
                        >
                          ✏️ Edit in Composer
                        </button>
                        <button
                          type="button"
                          onClick={handleSendRequest}
                          disabled={loading}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition cursor-pointer flex items-center gap-1"
                        >
                          🚀 Run Live
                        </button>
                      </div>
                    </div>

                    {/* 1. Request Endpoint URL */}
                    <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1.5">
                      <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                        1. Target URL (Dynamic Parameters Resolved)
                      </span>
                      <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded border border-zinc-800/90 font-mono text-xs overflow-x-auto no-scrollbar">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${getMethodColor(
                            method
                          )}`}
                        >
                          {method}
                        </span>
                        <span className="text-zinc-200 break-all select-all flex-1">
                          {url}
                        </span>
                      </div>
                    </div>

                    {/* 2. Query Parameters Table */}
                    <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                          2. Query Parameters ({params.filter((p) => p.key.trim()).length})
                        </span>
                        <button
                          type="button"
                          onClick={() => setRequestTab("params")}
                          className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
                        >
                          Modify Params →
                        </button>
                      </div>
                      {params.filter((p) => p.key.trim()).length > 0 ? (
                        <div className="rounded border border-zinc-800/90 overflow-hidden">
                          <table className="w-full text-left text-xs font-mono">
                            <thead className="bg-zinc-950 text-zinc-400 text-[10px] uppercase border-b border-zinc-800">
                              <tr>
                                <th className="py-1 px-2.5">Key</th>
                                <th className="py-1 px-2.5">Sample Value</th>
                                <th className="py-1 px-2.5">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/60 bg-zinc-950/40">
                              {params
                                .filter((p) => p.key.trim())
                                .map((p, idx) => (
                                  <tr key={idx} className="hover:bg-zinc-900/40">
                                    <td className="py-1.5 px-2.5 text-cyan-300 font-medium">
                                      {p.key}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-emerald-300 font-bold select-all">
                                      {p.value}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-zinc-500 text-[10px]">
                                      {p.enabled ? "Active" : "Disabled"}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 italic py-0.5">
                          No query parameters required for this endpoint.
                        </p>
                      )}
                    </div>

                    {/* 3. Request Headers Table */}
                    <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                          3. Request Headers ({headers.filter((h) => h.key.trim()).length})
                        </span>
                        <button
                          type="button"
                          onClick={() => setRequestTab("headers")}
                          className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
                        >
                          Modify Headers →
                        </button>
                      </div>
                      <div className="rounded border border-zinc-800/90 overflow-hidden">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-zinc-950 text-zinc-400 text-[10px] uppercase border-b border-zinc-800">
                            <tr>
                              <th className="py-1 px-2.5">Header</th>
                              <th className="py-1 px-2.5">Example Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/60 bg-zinc-950/40">
                            {headers
                              .filter((h) => h.key.trim())
                              .map((h, idx) => (
                                <tr key={idx} className="hover:bg-zinc-900/40">
                                  <td className="py-1.5 px-2.5 text-cyan-300">{h.key}</td>
                                  <td className="py-1.5 px-2.5 text-zinc-300 select-all">
                                    {h.value}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 4. Request Body Payload */}
                    <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                          4. Request Body (JSON Payload)
                        </span>
                        {allowsBody && (
                          <button
                            type="button"
                            onClick={() => setRequestTab("body")}
                            className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
                          >
                            Edit Body →
                          </button>
                        )}
                      </div>
                      {allowsBody ? (
                        <div className="rounded bg-zinc-950 border border-zinc-800 p-2.5 overflow-x-auto no-scrollbar">
                          <pre
                            suppressHydrationWarning
                            className="text-emerald-300 font-mono text-xs leading-relaxed select-all"
                          >
                            {body || "{}"}
                          </pre>
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 italic py-0.5">
                          HTTP {method} requests do not send a payload body.
                        </p>
                      )}
                    </div>

                    {/* 5. Expected Response Schema */}
                    {expectedResponse && (
                      <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-cyan-400">
                            5. Expected Response Schema ({expectedResponse.statusCode}{" "}
                            {expectedResponse.statusText})
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setResponseViewMode("example");
                              setResponseTab("body");
                            }}
                            className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
                          >
                            Inspect in Response Tab →
                          </button>
                        </div>
                        <div className="rounded bg-zinc-950 border border-zinc-800 p-2.5 overflow-x-auto no-scrollbar">
                          <pre
                            suppressHydrationWarning
                            className="text-cyan-300/90 font-mono text-xs leading-relaxed select-all"
                          >
                            {expectedResponse.body}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}

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
                          className="flex-1 w-full p-3 font-mono text-xs rounded bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 resize-none no-scrollbar"
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
              <div className="px-4 py-2 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between text-xs select-none shrink-0 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  {/* Mode Switcher: Live Response vs Expected Example */}
                  <div className="flex items-center bg-zinc-950 p-0.5 rounded-md border border-zinc-800">
                    {response && (
                      <button
                        onClick={() => setResponseViewMode("live")}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                          responseViewMode === "live"
                            ? "bg-zinc-800 text-white shadow-xs"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>Live Response</span>
                      </button>
                    )}
                    <button
                      onClick={() => setResponseViewMode("example")}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                        responseViewMode === "example"
                          ? "bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 shadow-xs"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                      title="View expected response schema & example output"
                    >
                      <span>⚡</span>
                      <span>Expected Example</span>
                    </button>
                  </div>

                  <div className="h-4 w-[1px] bg-zinc-800 mx-1 hidden sm:block" />

                  {/* Sub-tabs: Body vs Headers */}
                  <button
                    onClick={() => setResponseTab("body")}
                    className={`px-2.5 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                      responseTab === "body"
                        ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Response Body
                  </button>
                  <button
                    onClick={() => setResponseTab("headers")}
                    className={`px-2.5 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                      responseTab === "headers"
                        ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Headers (
                    {responseViewMode === "live" && response
                      ? Object.keys(response.headers).length
                      : expectedResponse
                      ? Object.keys(expectedResponse.headers).length
                      : 0}
                    )
                  </button>
                </div>

                {/* Metadata Badges & Actions */}
                {responseViewMode === "live" && response ? (
                  <div className="flex items-center gap-2.5 text-xs font-mono">
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
                      onClick={handleCopyResponseBody}
                      disabled={!response.body}
                      className="px-2 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer"
                      title="Copy response body"
                    >
                      {copyFeedback ? "Copied!" : "Copy"}
                    </button>
                  </div>
                ) : expectedResponse ? (
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold border shadow-sm ${getStatusBadgeClass(
                        expectedResponse.statusCode
                      )}`}
                    >
                      {expectedResponse.statusCode} {expectedResponse.statusText}
                    </span>

                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-950/60 text-cyan-400 border border-cyan-800/50 uppercase tracking-wider">
                      Expected Schema
                    </span>

                    <button
                      onClick={handleCopyResponseBody}
                      className="px-2 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer"
                      title="Copy example response"
                    >
                      {copyFeedback ? "Copied!" : "Copy Example"}
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Response Content View */}
              <div className="flex-1 overflow-auto no-scrollbar p-4 font-mono text-xs leading-relaxed">
                {loading ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500">
                    <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-zinc-300 animate-spin mb-3" />
                    <p className="text-sm font-medium text-zinc-300">Sending HTTP request...</p>
                    <p className="text-xs text-zinc-500 mt-1">Awaiting response from target server</p>
                  </div>
                ) : responseViewMode === "example" && expectedResponse ? (
                  /* EXPECTED / EXAMPLE RESPONSE PREVIEW */
                  <div className="h-full flex flex-col min-h-0">
                    <div className="mb-3 px-3.5 py-2 rounded-lg bg-cyan-950/30 border border-cyan-800/50 text-cyan-300 text-xs flex items-center justify-between gap-3 shrink-0">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">💡</span>
                        <div>
                          <p className="font-semibold text-cyan-200">
                            Expected Response Example Preview
                          </p>
                          <p className="text-[11px] text-cyan-400/90 mt-0.5">
                            This is an example schema of what this endpoint returns on success. Click <strong>Send</strong> to execute live call.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleSendRequest}
                        disabled={loading}
                        className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer flex items-center gap-1.5 shrink-0"
                      >
                        <span>🚀 Send Live</span>
                      </button>
                    </div>

                    {responseTab === "body" ? (
                      <div className="flex-1 overflow-auto no-scrollbar select-text bg-zinc-900/40 rounded-lg border border-zinc-800/80 p-3.5">
                        <pre
                          suppressHydrationWarning
                          className="whitespace-pre-wrap text-emerald-300/95 font-mono text-xs leading-relaxed"
                        >
                          {expectedResponse.body}
                        </pre>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-auto no-scrollbar select-text bg-zinc-900/40 rounded-lg border border-zinc-800/80">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-zinc-800 text-zinc-400 font-mono text-[11px] uppercase bg-zinc-900/60">
                              <th className="py-2 px-3 font-semibold">Header</th>
                              <th className="py-2 px-3 font-semibold">Expected Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/50">
                            {Object.entries(expectedResponse.headers).map(([key, value]) => (
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
                ) : responseViewMode === "live" && response ? (
                  responseTab === "body" ? (
                    /* LIVE TAB 1: RESPONSE BODY */
                    <div className="h-full select-text overflow-auto no-scrollbar">
                      {!response.body ? (
                        <div className="h-full flex items-center justify-center text-zinc-500 italic">
                          (Empty response body)
                        </div>
                      ) : (
                        <pre
                          suppressHydrationWarning
                          className="whitespace-pre-wrap text-zinc-300"
                        >
                          {getFormattedResponseBody()}
                        </pre>
                      )}
                    </div>
                  ) : (
                    /* LIVE TAB 2: RESPONSE HEADERS */
                    <div className="select-text overflow-auto no-scrollbar">
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
                  )
                ) : (
                  /* EMPTY STATE FALLBACK */
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
                        onClick={() => handleSelectPreset("GET", `${BACKEND_URL}/health`)}
                        className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors cursor-pointer"
                      >
                        Backend Health (GET)
                      </button>
                      <button
                        onClick={() => handleSelectPreset("GET", `${BACKEND_URL}/api/workspaces`)}
                        className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors cursor-pointer"
                      >
                        Workspaces (GET)
                      </button>
                      <button
                        onClick={() => handleSelectPreset("GET", `${BACKEND_URL}/api/processes`)}
                        className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors cursor-pointer"
                      >
                        Processes (GET)
                      </button>
                    </div>
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
