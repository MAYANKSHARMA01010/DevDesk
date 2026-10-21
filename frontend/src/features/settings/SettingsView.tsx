"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchDiagnostics, DiagnosticsData } from "@/services/diagnostics";

export function SettingsView() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

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

  function formatUptime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) {
      return `${hrs}h ${mins % 60}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  }

  const shortcuts = [
    { key: `${modKey}1`, action: "Projects", desc: "Workspace projects discovery and actions" },
    { key: `${modKey}2`, action: "Terminal", desc: "Package script runner and live stream logs" },
    { key: `${modKey}3`, action: "Processes", desc: "Process lifecycle and TCP port detection" },
    { key: `${modKey}4`, action: "Git", desc: "Repository status, diffs, staging, and commits" },
    { key: `${modKey}5`, action: "API Tester", desc: "Postman-style HTTP endpoint testing" },
    { key: `${modKey}6`, action: "Environment", desc: "Safe project .env editing and validation" },
    { key: `${modKey}7`, action: "Database", desc: "PostgreSQL and MySQL read-only manager" },
    { key: `${modKey},`, action: "Settings", desc: "System diagnostics and shortcuts reference" },
  ];

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100 flex items-center gap-2.5">
            Settings & Diagnostics
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono">
              v{diagnostics?.version || "0.1.0"}
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            System runtime information, local persistence locations, and keyboard shortcuts.
          </p>
        </div>

        <button
          onClick={loadDiagnostics}
          disabled={loading}
          className="px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700 transition flex items-center gap-1.5 disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
              <span>Checking...</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh Status</span>
            </>
          )}
        </button>
      </div>

      {/* Error alert if backend unreachable */}
      {error && (
        <div className="p-3.5 rounded-lg border border-rose-800/60 bg-rose-950/40 text-rose-200 text-xs flex items-start gap-2.5">
          <span className="text-rose-400 font-bold">!</span>
          <div className="flex-1">
            <span className="font-semibold">Backend Unreachable: </span>
            {error}
          </div>
        </div>
      )}

      {/* Section 1: Runtime Environment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Electron Shell Info */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              Desktop Environment
            </h2>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                isDesktop
                  ? "bg-emerald-950/70 border border-emerald-800 text-emerald-300"
                  : "bg-amber-950/70 border border-amber-800 text-amber-300"
              }`}
            >
              {isDesktop ? "Electron Native Shell" : "Web Browser Mode"}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-zinc-800/80">
              <span className="text-zinc-400">Electron Version:</span>
              <span className="font-mono text-zinc-200">
                {electronVersions?.electron || (isDesktop ? "Available" : "N/A")}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800/80">
              <span className="text-zinc-400">Chromium Version:</span>
              <span className="font-mono text-zinc-200">
                {electronVersions?.chrome || "N/A"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800/80">
              <span className="text-zinc-400">Desktop Node.js:</span>
              <span className="font-mono text-zinc-200">
                {electronVersions?.node || "N/A"}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-zinc-400">Context Isolation:</span>
              <span className="font-mono text-emerald-400">Active (contextIsolation: true)</span>
            </div>
          </div>
        </div>

        {/* Backend API Service Info */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  diagnostics ? "bg-emerald-400" : "bg-rose-500"
                }`}
              />
              Backend Service
            </h2>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                diagnostics
                  ? "bg-emerald-950/70 border border-emerald-800 text-emerald-300"
                  : "bg-rose-950/70 border border-rose-800 text-rose-300"
              }`}
            >
              {diagnostics ? "Connected (:5001)" : "Offline"}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-zinc-800/80">
              <span className="text-zinc-400">Backend Node.js:</span>
              <span className="font-mono text-zinc-200">
                {diagnostics?.nodeVersion || "—"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800/80">
              <span className="text-zinc-400">Platform:</span>
              <span className="font-mono text-zinc-200">
                {diagnostics?.platform || "—"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800/80">
              <span className="text-zinc-400">Process Uptime:</span>
              <span className="font-mono text-zinc-200">
                {diagnostics ? formatUptime(diagnostics.uptime) : "—"}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-zinc-400">Active Managed Processes:</span>
              <span className="font-mono text-cyan-300">
                {diagnostics !== null ? diagnostics.runningProcessesCount : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Storage & Persistence */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-violet-400" />
          Local Storage & SQLite Persistence
        </h2>

        <div className="space-y-3 text-xs">
          <div>
            <div className="text-zinc-400 mb-1">Application Data Directory:</div>
            <div className="p-2 rounded bg-zinc-950 border border-zinc-800 font-mono text-zinc-300 break-all select-all">
              {diagnostics?.appDataDir || "Loading..."}
            </div>
          </div>

          <div>
            <div className="text-zinc-400 mb-1">SQLite Database File:</div>
            <div className="p-2 rounded bg-zinc-950 border border-zinc-800 font-mono text-zinc-300 break-all select-all">
              {diagnostics?.dbPath || "Loading..."}
            </div>
          </div>

          <div className="text-[11px] text-zinc-500 pt-1">
            Note: DevDesk stores workspace roots and project metadata locally via SQLite (WAL mode). Sensitive credentials, passwords, and tokens are never persisted in the SQLite database.
          </div>
        </div>
      </div>

      {/* Section 3: Keyboard Shortcuts */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Desktop Keyboard Shortcuts
          </h2>
          <span className="text-[11px] text-zinc-500">
            Active globally when text inputs are not focused
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="py-2 px-3 font-medium">Shortcut</th>
                <th className="py-2 px-3 font-medium">Target Feature</th>
                <th className="py-2 px-3 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {shortcuts.map((sc) => (
                <tr key={sc.key} className="hover:bg-zinc-800/30 transition">
                  <td className="py-2 px-3">
                    <kbd className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[11px] text-zinc-200">
                      {sc.key}
                    </kbd>
                  </td>
                  <td className="py-2 px-3 font-medium text-zinc-200">{sc.action}</td>
                  <td className="py-2 px-3 text-zinc-400">{sc.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 4: Security & Safety Standards */}
      <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/50 space-y-2">
        <h3 className="text-xs font-semibold text-zinc-300">DevDesk Security & Isolation Guarantees</h3>
        <ul className="text-[11px] text-zinc-400 space-y-1 list-disc list-inside">
          <li>Preload context isolation prevents arbitrary Node.js execution in renderer.</li>
          <li>Database queries are verified via AST parser to enforce strictly read-only SQL statements.</li>
          <li>Environment variables are stored in project-local <code className="text-zinc-300">.env</code> files with atomic writes and timestamped backups.</li>
          <li>Child processes and project scripts run strictly under isolated process managers with signal termination.</li>
        </ul>
        {lastRefreshed && (
          <div className="text-[10px] text-zinc-600 pt-2 font-mono">
            Last checked: {lastRefreshed.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
