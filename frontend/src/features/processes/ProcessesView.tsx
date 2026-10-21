"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchProcesses,
  restartProcess,
  stopProcess,
} from "@/services/processes";
import { ManagedProcess, ProcessStatus } from "@/types/process";

interface ProcessesViewProps {
  onNavigateToTerminal?: (selection: {
    workspaceId?: string;
    projectId?: string;
    script?: string;
  }) => void;
  onNavigateToProjects?: () => void;
}

export function ProcessesView({
  onNavigateToTerminal,
  onNavigateToProjects,
}: ProcessesViewProps) {
  const [processes, setProcesses] = useState<ManagedProcess[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "stopped">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Ticking state for live duration updates
  const [, setTick] = useState<number>(0);

  const isMountedRef = useRef<boolean>(true);
  const isFetchingRef = useRef<boolean>(false);

  // 1. Fetch processes function with overlap prevention
  async function loadProcesses(isManualRefresh = false) {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (isManualRefresh) {
      setRefreshing(true);
    }

    try {
      const data = await fetchProcesses();
      if (!isMountedRef.current) return;
      setProcesses(data);
      setErrorMessage(null);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to load managed processes"
      );
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      isFetchingRef.current = false;
    }
  }

  // 2. Initial fetch & active process polling loop (1.75s)
  useEffect(() => {
    isMountedRef.current = true;
    loadProcesses();

    const interval = setInterval(() => {
      // Check if any process is active (starting, running, stopping)
      setProcesses((current) => {
        const hasActive = current.some(
          (p) =>
            p.status === "running" ||
            p.status === "starting" ||
            p.status === "stopping"
        );
        if (hasActive) {
          loadProcesses();
        }
        return current;
      });
      // Trigger duration re-render every tick
      setTick((t) => t + 1);
    }, 1750);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  // 3. Process actions: Stop and Restart
  async function handleStop(proc: ManagedProcess) {
    if (proc.status !== "running" && proc.status !== "starting") return;

    try {
      setActionLoadingId(proc.id);
      setErrorMessage(null);
      const updated = await stopProcess(proc.id);
      setProcesses((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
      );
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : `Failed to stop ${proc.script}`
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleRestart(proc: ManagedProcess) {
    try {
      setActionLoadingId(proc.id);
      setErrorMessage(null);
      const updated = await restartProcess(proc.id);
      setProcesses((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
      );
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : `Failed to restart ${proc.script}`
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  // Helper formatting methods
  function formatDuration(startedAt: string, stoppedAt?: string): string {
    try {
      const start = new Date(startedAt).getTime();
      const end = stoppedAt ? new Date(stoppedAt).getTime() : Date.now();
      const diffSecs = Math.max(0, Math.floor((end - start) / 1000));

      if (diffSecs < 60) return `${diffSecs}s`;
      const mins = Math.floor(diffSecs / 60);
      const secs = diffSecs % 60;
      if (mins < 60) return `${mins}m ${secs}s`;
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hours}h ${remMins}m`;
    } catch {
      return "—";
    }
  }

  function formatStartTime(startedAt: string): string {
    try {
      const d = new Date(startedAt);
      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return "";
    }
  }

  function renderStatusBadge(status: ProcessStatus, exitCode?: number | null) {
    switch (status) {
      case "running":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/70 text-emerald-300 border border-emerald-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Running</span>
          </span>
        );
      case "starting":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/70 text-amber-300 border border-amber-800/60">
            <span className="w-2 h-2 rounded-full border border-amber-400 border-t-transparent animate-spin" />
            <span>Starting</span>
          </span>
        );
      case "stopping":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/70 text-amber-300 border border-amber-800/60">
            <span className="w-2 h-2 rounded-full border border-amber-400 border-t-transparent animate-spin" />
            <span>Stopping</span>
          </span>
        );
      case "exited":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            <span>Exited {exitCode !== null ? `(${exitCode})` : ""}</span>
          </span>
        );
      case "stopped":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800/80 text-zinc-400 border border-zinc-700/50">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            <span>Stopped</span>
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-950/70 text-rose-300 border border-rose-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <span>Failed {exitCode !== null ? `(${exitCode})` : ""}</span>
          </span>
        );
    }
  }

  function renderPortsBadge(proc: ManagedProcess) {
    if (proc.status === "stopped" || proc.status === "exited") {
      return <span className="text-zinc-500 text-xs">—</span>;
    }

    if (proc.status === "failed") {
      return <span className="text-rose-400/80 text-xs">Exited</span>;
    }

    if (proc.status === "starting") {
      return (
        <span className="text-amber-400/80 text-xs flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
          Detecting...
        </span>
      );
    }

    if (proc.portStatus === "failed") {
      return (
        <span className="text-zinc-500 text-xs" title="Port inspection unsupported or failed">
          Detection failed
        </span>
      );
    }

    if (proc.ports && proc.ports.length > 0) {
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {proc.ports.map((port) => (
            <span
              key={port}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 text-xs font-mono font-medium shadow-sm hover:border-emerald-600 transition-colors"
              title={`Port ${port} active on localhost`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>:{port}</span>
            </span>
          ))}
        </div>
      );
    }

    return (
      <span className="text-zinc-500 text-xs font-mono" title="No TCP listening sockets detected">
        No open ports
      </span>
    );
  }

  // Filtered list
  const filteredProcesses = processes.filter((proc) => {
    if (filter === "active") {
      if (proc.status !== "running" && proc.status !== "starting" && proc.status !== "stopping") {
        return false;
      }
    } else if (filter === "stopped") {
      if (proc.status === "running" || proc.status === "starting" || proc.status === "stopping") {
        return false;
      }
    }

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const matchProject = proc.projectName.toLowerCase().includes(q);
      const matchScript = proc.script.toLowerCase().includes(q);
      const matchPid = proc.pid ? proc.pid.toString().includes(q) : false;
      const matchPorts = proc.ports ? proc.ports.some((p) => p.toString().includes(q)) : false;
      return matchProject || matchScript || matchPid || matchPorts;
    }

    return true;
  });

  // Summary counts
  const totalCount = processes.length;
  const activeCount = processes.filter(
    (p) => p.status === "running" || p.status === "starting" || p.status === "stopping"
  ).length;
  const allDetectedPorts = Array.from(
    new Set(
      processes
        .filter((p) => p.status === "running" && p.ports && p.ports.length > 0)
        .flatMap((p) => p.ports || [])
    )
  ).sort((a, b) => a - b);

  return (
    <div className="flex flex-col h-full p-6 text-zinc-100 w-full">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight">Process & Port Manager</h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
              {activeCount} active / {totalCount} total
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Monitor DevDesk-managed processes and real-time TCP listening sockets.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadProcesses(true)}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Refresh process list and listening ports"
          >
            <span className={refreshing ? "animate-spin" : ""}>🔄</span>
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* 2. Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              Managed Services
            </div>
            <div className="text-lg font-semibold text-zinc-100 mt-0.5">{totalCount}</div>
          </div>
          <div className="w-8 h-8 rounded-md bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-400 text-sm">
            ⚙️
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              Active Running
            </div>
            <div className="text-lg font-semibold text-emerald-400 mt-0.5">{activeCount}</div>
          </div>
          <div className="w-8 h-8 rounded-md bg-emerald-950/40 border border-emerald-800/50 flex items-center justify-center text-emerald-400 text-sm">
            ⚡
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              Listening Ports
            </div>
            <div className="text-lg font-semibold text-cyan-400 mt-0.5">
              {allDetectedPorts.length > 0 ? (
                <span className="font-mono text-sm">
                  {allDetectedPorts.map((p) => `:${p}`).join(", ")}
                </span>
              ) : (
                "None"
              )}
            </div>
          </div>
          <div className="w-8 h-8 rounded-md bg-cyan-950/40 border border-cyan-800/50 flex items-center justify-center text-cyan-400 text-sm">
            🌐
          </div>
        </div>
      </div>

      {/* 3. Error Banner */}
      {errorMessage && (
        <div className="mb-4 p-3 rounded-lg bg-rose-950/50 border border-rose-900/60 text-rose-300 text-xs flex items-center justify-between gap-3 animate-in fade-in">
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

      {/* 4. Filter & Search Toolbar */}
      <div className="p-3 rounded-t-lg bg-zinc-900/80 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              filter === "all"
                ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setFilter("active")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              filter === "active"
                ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setFilter("stopped")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              filter === "stopped"
                ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Stopped ({totalCount - activeCount})
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search project, script, port, PID..."
            className="w-56 sm:w-64 px-3 py-1.5 text-xs rounded-md bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1.5 text-xs text-zinc-500 hover:text-zinc-300"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 5. Main Content: Table or Empty/Loading State */}
      <div className="flex-1 min-h-0 border-x border-b border-zinc-800 rounded-b-lg bg-zinc-950/70 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-zinc-200 animate-spin mb-4" />
            <p className="text-sm font-medium text-zinc-300">Loading managed processes...</p>
            <p className="text-xs text-zinc-500 mt-1">Inspecting active process tree and sockets</p>
          </div>
        ) : processes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm font-mono text-zinc-400 mb-4 shadow-sm">
              ⚡
            </div>
            <p className="text-sm font-semibold text-zinc-200">No Managed Processes</p>
            <p className="text-xs text-zinc-400 mt-1 max-w-md leading-relaxed">
              No project scripts have been executed yet in DevDesk. Start a script from the Terminal
              or Projects view to inspect its process and detected listening ports.
            </p>
            <div className="mt-5 flex items-center gap-3">
              {onNavigateToTerminal && (
                <button
                  onClick={() => onNavigateToTerminal({})}
                  className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-sm cursor-pointer"
                >
                  Go to Terminal
                </button>
              )}
              {onNavigateToProjects && (
                <button
                  onClick={onNavigateToProjects}
                  className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer"
                >
                  View Projects
                </button>
              )}
            </div>
          </div>
        ) : filteredProcesses.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-zinc-500">
            <p className="text-sm font-medium text-zinc-300">No matching processes found</p>
            <p className="text-xs text-zinc-500 mt-1">
              Try adjusting your filter or search query.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-zinc-900/40 text-zinc-400 font-mono text-[11px] uppercase tracking-wider select-none">
                  <th className="py-2.5 px-4 font-semibold">Service</th>
                  <th className="py-2.5 px-4 font-semibold">PID</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold">Listening Ports</th>
                  <th className="py-2.5 px-4 font-semibold">Uptime / Started</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40 font-sans">
                {filteredProcesses.map((proc) => {
                  const isActionLoading = actionLoadingId === proc.id;
                  const isCanStop = proc.status === "running" || proc.status === "starting";
                  const isCanRestart = proc.status !== "stopping";

                  return (
                    <tr
                      key={proc.id}
                      className="hover:bg-zinc-900/50 transition-colors group"
                    >
                      {/* 1. Service (Project & Script) */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 font-medium text-zinc-100">
                            <span>{proc.projectName}</span>
                            <span className="text-zinc-500">→</span>
                            <span className="font-mono text-emerald-400">{proc.script}</span>
                          </div>
                          <span
                            className="text-[11px] font-mono text-zinc-500 truncate max-w-xs mt-0.5"
                            title={proc.command}
                          >
                            {proc.command}
                          </span>
                        </div>
                      </td>

                      {/* 2. PID */}
                      <td className="py-3 px-4 font-mono text-zinc-400">
                        {proc.pid ? (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px]">
                            {proc.pid}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      {/* 3. Status */}
                      <td className="py-3 px-4">
                        {renderStatusBadge(proc.status, proc.exitCode)}
                      </td>

                      {/* 4. Listening Ports */}
                      <td className="py-3 px-4">
                        {renderPortsBadge(proc)}
                      </td>

                      {/* 5. Uptime / Started */}
                      <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">
                        <div>{formatDuration(proc.startedAt, proc.stoppedAt)}</div>
                        <div className="text-zinc-600 text-[10px]">
                          {formatStartTime(proc.startedAt)}
                        </div>
                      </td>

                      {/* 6. Controls */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Inspect Logs Action */}
                          {onNavigateToTerminal && (
                            <button
                              onClick={() =>
                                onNavigateToTerminal({
                                  workspaceId: proc.workspaceId,
                                  projectId: proc.projectId,
                                  script: proc.script,
                                })
                              }
                              className="px-2.5 py-1 rounded text-xs font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-all cursor-pointer shadow-sm"
                              title="View process output in Terminal"
                            >
                              Logs
                            </button>
                          )}

                          {/* Stop Action */}
                          <button
                            onClick={() => handleStop(proc)}
                            disabled={isActionLoading || !isCanStop}
                            className={`px-2.5 py-1 rounded text-xs font-medium border transition-all cursor-pointer ${
                              isCanStop
                                ? "bg-rose-950/60 border-rose-800/60 text-rose-300 hover:bg-rose-900 hover:text-white"
                                : "opacity-30 border-transparent text-zinc-600 cursor-not-allowed"
                            }`}
                            title={isCanStop ? "Stop process" : "Process is not running"}
                          >
                            Stop
                          </button>

                          {/* Restart Action */}
                          <button
                            onClick={() => handleRestart(proc)}
                            disabled={isActionLoading || !isCanRestart}
                            className={`px-2.5 py-1 rounded text-xs font-medium border transition-all cursor-pointer ${
                              isCanRestart
                                ? "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                                : "opacity-30 border-transparent text-zinc-600 cursor-not-allowed"
                            }`}
                            title="Restart process"
                          >
                            Restart
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
