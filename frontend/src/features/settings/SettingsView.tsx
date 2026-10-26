"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchDiagnostics, DiagnosticsData } from "@/services/diagnostics";
import { BACKEND_URL, LOCAL_API_URL, HOSTED_API_URL, getBackendDisplayLabel } from "@/config/env";
import { broadcastWorkspacesChanged } from "@/services/workspaceSync";

export function SettingsView() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [pinging, setPinging] = useState(false);
  const [resettingDb, setResettingDb] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [isDesktop, setIsDesktop] = useState(false);
  const [electronVersions, setElectronVersions] = useState<
    { node: string; chrome: string; electron: string } | undefined
  >(undefined);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const desktop = typeof window !== "undefined" && Boolean(window.electron);
    setIsDesktop(desktop);
    if (desktop && window.electron?.versions) {
      setElectronVersions(window.electron.versions);
    }
    const mac =
      typeof window !== "undefined" &&
      (window.electron?.platform === "darwin" ||
        (typeof navigator !== "undefined" &&
          navigator.platform.toUpperCase().indexOf("MAC") >= 0));
    setIsMac(mac);
  }, []);

  const modKey = isMac ? "⌘" : "Ctrl+";

  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDiagnostics();
      setDiagnostics(data);
      setLastRefreshed(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load diagnostics";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiagnostics();
  }, [loadDiagnostics]);

  async function handleTestPing() {
    setPinging(true);
    const start = performance.now();
    try {
      const res = await fetch(`${BACKEND_URL}/health`, { cache: "no-store" });
      if (res.ok) {
        setPingLatency(Math.round(performance.now() - start));
      } else {
        setPingLatency(null);
      }
    } catch {
      setPingLatency(null);
    } finally {
      setPinging(false);
    }
  }

  function handleCopy(text: string, key: string) {
    if (!text || text === "—") return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  }

  async function handleReveal(targetPath: string, key?: string) {
    if (!targetPath || targetPath === "—") return;
    if (window.electron?.revealInFinder) {
      await window.electron.revealInFinder(targetPath);
      if (key) {
        setRevealedKey(key);
        setTimeout(() => setRevealedKey(null), 2000);
      }
    }
  }

  async function handleResetDatabase() {
    setResettingDb(true);
    setResetFeedback(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/diagnostics/reset-database`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResetFeedback({
          type: "success",
          text: data.message || "Local SQLite database was successfully reset to a clean state.",
        });
        setShowResetConfirm(false);
        await loadDiagnostics();
        broadcastWorkspacesChanged();
      } else {
        setResetFeedback({
          type: "error",
          text: data.error || "Failed to reset local database.",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error resetting database";
      setResetFeedback({ type: "error", text: msg });
    } finally {
      setResettingDb(false);
    }
  }

  function formatUptime(seconds?: number): string {
    const s = typeof seconds === "number" && !isNaN(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const days = Math.floor(s / 86400);
    const hrs = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    if (days > 0) return `${days}d ${hrs}h ${mins}m`;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  }

  const shortcuts = [
    { key: `${modKey}1`, action: "Projects", desc: "View workspaces & detected projects" },
    { key: `${modKey}2`, action: "Terminal", desc: "Interactive scripts & command runner" },
    { key: `${modKey}3`, action: "Processes", desc: "Active system process monitor" },
    { key: `${modKey}4`, action: "Git Control", desc: "Branches, diffs, and commit manager" },
    { key: `${modKey}5`, action: "API Tester", desc: "REST & HTTP client with catalog" },
    { key: `${modKey}6`, action: "Database", desc: "SQLite inspector & SQL console" },
    { key: `${modKey}7`, action: "Environment", desc: "Multi-tab atomic .env editor" },
    { key: `${modKey}B`, action: "Toggle Sidebar", desc: "Collapse or expand sidebar rail" },
    { key: `${modKey},`, action: "Settings", desc: "System diagnostics and shortcuts reference" },
  ];

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto space-y-6 bg-[#101216] text-[#E8EBF1]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#303642] pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#E8EBF1] flex items-center gap-2.5">
            Settings & Diagnostics
            <span className="text-xs px-2 py-0.5 rounded-md bg-[#272D38] border border-[#303642] text-[#A5ADBA] font-mono">
              v{diagnostics?.version || "1.0.0"}
            </span>
          </h1>
          <p className="text-xs text-[#A5ADBA] mt-1">
            System runtime information, local persistence locations, and keyboard shortcuts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestPing}
            disabled={pinging || !diagnostics}
            className="px-3 py-1.5 rounded-md bg-[#272D38] hover:bg-[#303642] text-xs font-medium text-[#E8EBF1] border border-[#303642] transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            title="Ping backend health endpoint to measure roundtrip latency"
          >
            {pinging ? (
              <span className="w-3 h-3 border-2 border-[#8CA9CF] border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-[#8CA9CF]" />
            )}
            <span>
              {pingLatency !== null ? `${pingLatency}ms Ping` : "Test Latency"}
            </span>
          </button>

          <button
            type="button"
            onClick={loadDiagnostics}
            disabled={loading}
            className="px-3 py-1.5 rounded-md bg-[#8CA9CF] hover:bg-[#A6BDE0] text-xs font-medium text-[#101216] border border-transparent transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <span className="w-3 h-3 border-2 border-[#101216] border-t-transparent rounded-full animate-spin" />
                <span>Checking...</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-[#101216]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refresh Status</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error alert if backend unreachable */}
      {error && (
        <div className="p-3.5 rounded-lg border border-[#E18B8B]/50 bg-[#272D38] text-[#E18B8B] text-xs flex items-start gap-2.5">
          <span className="font-bold">!</span>
          <div className="flex-1">
            <span className="font-semibold">Backend Unreachable: </span>
            {error}
          </div>
        </div>
      )}

      {/* Section 1: Runtime Environment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Electron Shell Info */}
        <div className="p-4 rounded-lg border border-[#303642] bg-[#1D2129] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#E8EBF1] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8CA9CF]" />
              Desktop Environment
            </h2>
            <span
              className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${
                isDesktop
                  ? "bg-[rgba(140,169,207,0.12)] border border-[#8CA9CF]/35 text-[#8CA9CF]"
                  : "bg-[rgba(224,179,109,0.12)] border border-[#E0B36D]/35 text-[#E0B36D]"
              }`}
            >
              {isDesktop ? "Electron Native Shell" : "Web Browser Mode"}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[#303642]">
              <span className="text-[#A5ADBA]">Electron Version:</span>
              <span className="font-mono text-[#E8EBF1]">
                {electronVersions?.electron || (isDesktop ? "Available" : "N/A")}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#303642]">
              <span className="text-[#A5ADBA]">Chromium Version:</span>
              <span className="font-mono text-[#E8EBF1]">
                {electronVersions?.chrome || "N/A"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#303642]">
              <span className="text-[#A5ADBA]">Desktop Node.js:</span>
              <span className="font-mono text-[#E8EBF1]">
                {electronVersions?.node || "N/A"}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[#A5ADBA]">Context Isolation:</span>
              <span className="font-mono text-[#77B58A]">Active (contextIsolation: true)</span>
            </div>
          </div>
        </div>

        {/* Backend API Service Info */}
        <div className="p-4 rounded-lg border border-[#303642] bg-[#1D2129] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#E8EBF1] flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  diagnostics ? "bg-[#77B58A]" : "bg-[#E18B8B]"
                }`}
              />
              Backend Service
            </h2>
            <span
              className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${
                diagnostics
                  ? "bg-[rgba(119,181,138,0.12)] border border-[#77B58A]/35 text-[#77B58A]"
                  : "bg-[rgba(225,139,139,0.12)] border border-[#E18B8B]/35 text-[#E18B8B]"
              }`}
            >
              {diagnostics ? `Connected · ${getBackendDisplayLabel()}` : "Offline"}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[#303642] items-center">
              <span className="text-[#A5ADBA]">Target Backend API:</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[#8CA9CF] break-all text-[11px] font-medium">
                  {BACKEND_URL}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(BACKEND_URL, "api_url")}
                  className="px-1.5 py-0.5 rounded text-[10px] text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] border border-transparent hover:border-[#303642] transition cursor-pointer"
                  title="Copy Target API URL"
                >
                  {copiedKey === "api_url" ? "✓" : "Copy"}
                </button>
              </div>
            </div>
            <div className="flex justify-between py-1 border-b border-[#303642]">
              <span className="text-[#A5ADBA]">Hosted API URL:</span>
              <span className="font-mono text-[#7C8594] break-all text-[11px]">
                {HOSTED_API_URL || "(None — using local API)"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#303642]">
              <span className="text-[#A5ADBA]">Local API URL:</span>
              <span className="font-mono text-[#A5ADBA] break-all text-[11px]">
                {LOCAL_API_URL}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#303642]">
              <span className="text-[#A5ADBA]">Backend Node.js:</span>
              <span className="font-mono text-[#E8EBF1]">
                {diagnostics?.nodeVersion || "—"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#303642]">
              <span className="text-[#A5ADBA]">Platform:</span>
              <span className="font-mono text-[#E8EBF1]">
                {diagnostics?.platform || "—"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#303642]">
              <span className="text-[#A5ADBA]">Process Uptime:</span>
              <span className="font-mono text-[#E8EBF1]">
                {diagnostics ? formatUptime(diagnostics.uptime) : "—"}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[#A5ADBA]">Active Managed Processes:</span>
              <span className="font-mono text-[#8CA9CF] font-semibold">
                {diagnostics !== null ? diagnostics.runningProcessesCount : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Storage & Persistence */}
      <div className="p-4 rounded-lg border border-[#303642] bg-[#1D2129] space-y-3">
        <h2 className="text-sm font-semibold text-[#E8EBF1] flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#8CA9CF]" />
          Local Storage & SQLite Persistence
        </h2>

        <div className="space-y-3 text-xs">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[#A5ADBA]">Application Data Directory:</span>
              <div className="flex items-center gap-1.5">
                {diagnostics?.appDataDir && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleCopy(diagnostics.appDataDir, "appDataDir")}
                      className="px-2 py-0.5 rounded text-[11px] bg-[#272D38] hover:bg-[#303642] text-[#E8EBF1] border border-[#303642] transition cursor-pointer"
                    >
                      {copiedKey === "appDataDir" ? "✓ Copied" : "Copy Path"}
                    </button>
                    {isDesktop && (
                      <button
                        type="button"
                        onClick={() => handleReveal(diagnostics.appDataDir, "appDataDir")}
                        className="px-2 py-0.5 rounded text-[11px] bg-[#272D38] hover:bg-[#303642] text-[#E8EBF1] border border-[#303642] transition cursor-pointer"
                        title="Open folder in macOS Finder"
                      >
                        {revealedKey === "appDataDir" ? "✓ Opened" : "Open Folder"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="p-2.5 rounded-md bg-[#272D38] border border-[#303642] font-mono text-[#E8EBF1] break-all select-all text-xs">
              {loading && !diagnostics?.appDataDir ? (
                <div className="h-4 w-48 bg-[#303642]/60 rounded" />
              ) : (
                diagnostics?.appDataDir || "—"
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[#A5ADBA]">SQLite Database File:</span>
              <div className="flex items-center gap-1.5">
                {diagnostics?.dbPath && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleCopy(diagnostics.dbPath, "dbPath")}
                      className="px-2 py-0.5 rounded text-[11px] bg-[#272D38] hover:bg-[#303642] text-[#E8EBF1] border border-[#303642] transition cursor-pointer"
                    >
                      {copiedKey === "dbPath" ? "✓ Copied" : "Copy Path"}
                    </button>
                    {isDesktop && (
                      <button
                        type="button"
                        onClick={() => handleReveal(diagnostics.dbPath, "dbPath")}
                        className="px-2 py-0.5 rounded text-[11px] bg-[#272D38] hover:bg-[#303642] text-[#E8EBF1] border border-[#303642] transition cursor-pointer"
                        title="Reveal and highlight devdesk.db in macOS Finder"
                      >
                        {revealedKey === "dbPath" ? "✓ Revealed" : "Reveal in Finder"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="p-2.5 rounded-md bg-[#272D38] border border-[#303642] font-mono text-[#E8EBF1] break-all select-all text-xs">
              {loading && !diagnostics?.dbPath ? (
                <div className="h-4 w-64 bg-[#303642]/60 rounded" />
              ) : (
                diagnostics?.dbPath || "—"
              )}
            </div>
          </div>

          <div className="text-[11px] text-[#7C8594] pt-1">
            Note: DevDesk stores workspace roots and project metadata locally via SQLite (WAL mode). Sensitive credentials, passwords, and tokens are never persisted in the SQLite database.
          </div>

          {/* Reset Local Database Action */}
          <div className="mt-4 pt-4 border-t border-[#303642]/70">
            <div className="p-3.5 rounded-lg bg-[#171A20] border border-[#303642] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">🗄️</span>
                  <span className="text-xs font-semibold text-[#E8EBF1]">Reset Local SQLite Database</span>
                </div>
                <p className="text-[11px] text-[#A5ADBA] mt-1 max-w-xl">
                  Clears locally indexed workspaces, cached project records, and restores <code className="text-[#8CA9CF]">devdesk.db</code> to a fresh clean state. Your real project files and Git repositories on disk will not be touched.
                </p>
              </div>

              {!showResetConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  disabled={resettingDb}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-red-300 bg-red-950/40 border border-red-900/60 hover:bg-red-900/50 hover:text-red-200 transition-all cursor-pointer shrink-0 shadow-xs"
                >
                  Reset Local DB
                </button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleResetDatabase}
                    disabled={resettingDb}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    {resettingDb && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                    <span>Confirm & Reset</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(false)}
                    disabled={resettingDb}
                    className="px-3 py-1.5 rounded-md text-xs font-medium text-[#A5ADBA] bg-[#272D38] border border-[#303642] hover:bg-[#303642] hover:text-[#E8EBF1] transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {resetFeedback && (
              <div
                className={`mt-2.5 p-2.5 rounded-md text-xs flex items-center justify-between ${
                  resetFeedback.type === "success"
                    ? "bg-[#77B58A]/15 border border-[#77B58A]/40 text-[#77B58A]"
                    : "bg-[#E18B8B]/15 border border-[#E18B8B]/40 text-[#E18B8B]"
                }`}
              >
                <span>{resetFeedback.text}</span>
                <button
                  type="button"
                  onClick={() => setResetFeedback(null)}
                  className="ml-2 hover:opacity-80 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 3: Keyboard Shortcuts */}
      <div className="p-4 rounded-lg border border-[#303642] bg-[#1D2129] space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#E8EBF1] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8CA9CF]" />
            Desktop Keyboard Shortcuts
          </h2>
          <span className="text-[11px] text-[#7C8594]">
            Active globally when text inputs are not focused
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-[#303642] text-[#7C8594]">
                <th className="py-2 px-3 font-medium">Shortcut</th>
                <th className="py-2 px-3 font-medium">Target Feature</th>
                <th className="py-2 px-3 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#303642]/50">
              {shortcuts.map((sc) => (
                <tr key={sc.key} className="hover:bg-[#272D38]/40 transition">
                  <td className="py-2 px-3">
                    <kbd className="px-2 py-0.5 rounded bg-[#272D38] border border-[#303642] font-mono text-[11px] text-[#E8EBF1]">
                      {sc.key}
                    </kbd>
                  </td>
                  <td className="py-2 px-3 font-medium text-[#E8EBF1]">{sc.action}</td>
                  <td className="py-2 px-3 text-[#A5ADBA]">{sc.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 4: Security & Safety Standards */}
      <div className="p-4 rounded-lg border border-[#303642] bg-[#1D2129]/60 space-y-2">
        <h3 className="text-xs font-semibold text-[#E8EBF1]">DevDesk Security & Isolation Guarantees</h3>
        <ul className="text-[11px] text-[#A5ADBA] space-y-1 list-disc list-inside">
          <li>Preload context isolation prevents arbitrary Node.js execution in renderer.</li>
          <li>Database queries are verified via AST parser to enforce strictly read-only SQL statements.</li>
          <li>Environment variables are stored in project-local <code className="text-[#E8EBF1]">.env</code> files with atomic writes and timestamped backups.</li>
          <li>Child processes and project scripts run strictly under isolated process managers with signal termination.</li>
        </ul>
        {lastRefreshed && (
          <div className="text-[10px] text-[#7C8594] pt-2 font-mono">
            Last checked: {lastRefreshed.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
