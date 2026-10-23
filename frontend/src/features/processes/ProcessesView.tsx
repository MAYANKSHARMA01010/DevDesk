"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchProcesses,
  fetchSystemPorts,
  killSystemProcess,
  restartProcess,
  stopProcess,
} from "@/services/processes";
import { ManagedProcess, ProcessStatus, SystemPortInfo } from "@/types/process";

interface ProcessesViewProps {
  isActive?: boolean;
  onNavigateToTerminal?: (selection: {
    workspaceId?: string;
    projectId?: string;
    script?: string;
  }) => void;
  onNavigateToProjects?: () => void;
}

export function ProcessesView({
  isActive,
  onNavigateToTerminal,
  onNavigateToProjects,
}: ProcessesViewProps) {
  // Primary view mode: "ports" (All listening TCP ports on localhost/system) or "managed" (DevDesk services)
  const [viewMode, setViewMode] = useState<"ports" | "managed">("ports");

  // Managed processes state
  const [processes, setProcesses] = useState<ManagedProcess[]>([]);
  // System listening ports state
  const [systemPorts, setSystemPorts] = useState<SystemPortInfo[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [killingPid, setKillingPid] = useState<number | null>(null);

  // Kill confirmation modal state
  const [confirmKillTarget, setConfirmKillTarget] = useState<SystemPortInfo | null>(null);

  // Filters & Search
  const [managedFilter, setManagedFilter] = useState<"all" | "active" | "stopped">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Ticking state for live duration updates
  const [, setTick] = useState<number>(0);

  const isMountedRef = useRef<boolean>(true);
  const isFetchingRef = useRef<boolean>(false);

  // 1. Fetch processes and system listening ports
  async function loadData(isManualRefresh = false) {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (isManualRefresh) {
      setRefreshing(true);
    }

    try {
      const [managedData, portsData] = await Promise.all([
        fetchProcesses().catch(() => [] as ManagedProcess[]),
        fetchSystemPorts().catch(() => [] as SystemPortInfo[]),
      ]);

      if (!isMountedRef.current) return;
      setProcesses(managedData);
      setSystemPorts(portsData);
      setErrorMessage(null);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to load processes and listening ports"
      );
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      isFetchingRef.current = false;
    }
  }

  // 2. Initial fetch & background polling loop (2.5s)
  useEffect(() => {
    isMountedRef.current = true;
    loadData();

    const interval = setInterval(() => {
      // Re-fetch automatically
      loadData();
      setTick((t) => t + 1);
    }, 2500);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  // 3. Immediately refresh when switching to Processes tab
  useEffect(() => {
    if (isActive) {
      loadData();
    }
  }, [isActive]);

  // 4. Managed Process actions: Stop and Restart
  async function handleStopManaged(proc: ManagedProcess) {
    if (proc.status !== "running" && proc.status !== "starting") return;

    try {
      setActionLoadingId(proc.id);
      setErrorMessage(null);
      const updated = await stopProcess(proc.id);
      setProcesses((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
      );
      await loadData();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : `Failed to stop ${proc.script}`
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleRestartManaged(proc: ManagedProcess) {
    try {
      setActionLoadingId(proc.id);
      setErrorMessage(null);
      const updated = await restartProcess(proc.id);
      setProcesses((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
      );
      await loadData();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : `Failed to restart ${proc.script}`
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  // 5. System Process Kill Action
  async function handleKillSystemProcess(pid: number, force = false) {
    try {
      setKillingPid(pid);
      setErrorMessage(null);
      const msg = await killSystemProcess(pid, force);
      setSuccessMessage(msg);
      setConfirmKillTarget(null);
      // Immediately reload ports to reflect termination
      await loadData();
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : `Failed to terminate process PID ${pid}`
      );
    } finally {
      setKillingPid(null);
    }
  }

  // 6. Reveal directory in Finder
  async function handleReveal(dirPath: string) {
    if (window.electron?.revealInFinder) {
      await window.electron.revealInFinder(dirPath);
    }
  }

  // Formatting helpers
  function formatDuration(startedAt: string, stoppedAt?: string): string {
    const start = new Date(startedAt).getTime();
    const end = stoppedAt ? new Date(stoppedAt).getTime() : Date.now();
    const diffSec = Math.max(0, Math.floor((end - start) / 1000));

    if (diffSec < 60) return `${diffSec}s`;
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
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

  // Filtered System Ports
  const filteredSystemPorts = systemPorts.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      p.port.toString().includes(q) ||
      p.processName.toLowerCase().includes(q) ||
      p.pid.toString().includes(q) ||
      (p.cwd || "").toLowerCase().includes(q) ||
      (p.command || "").toLowerCase().includes(q) ||
      p.user.toLowerCase().includes(q) ||
      p.address.toLowerCase().includes(q)
    );
  });

  // Filtered Managed Processes
  const filteredProcesses = processes.filter((p) => {
    if (managedFilter === "active") {
      if (p.status !== "running" && p.status !== "starting" && p.status !== "stopping") {
        return false;
      }
    } else if (managedFilter === "stopped") {
      if (p.status === "running" || p.status === "starting" || p.status === "stopping") {
        return false;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchProject = p.projectName.toLowerCase().includes(q);
      const matchScript = p.script.toLowerCase().includes(q);
      const matchCommand = p.command.toLowerCase().includes(q);
      const matchPid = p.pid?.toString().includes(q);
      const matchPorts = p.ports?.some((port) => port.toString().includes(q));
      return matchProject || matchScript || matchCommand || matchPid || matchPorts;
    }

    return true;
  });

  // Metrics
  const activeManagedCount = processes.filter(
    (p) => p.status === "running" || p.status === "starting" || p.status === "stopping"
  ).length;

  const topListeningPorts = Array.from(new Set(systemPorts.map((p) => p.port))).sort(
    (a, b) => a - b
  );

  return (
    <div className="flex flex-col h-full p-6 text-zinc-100 w-full overflow-y-auto">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight">Process & Port Manager</h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
              {systemPorts.length} listening {systemPorts.length === 1 ? "port" : "ports"}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time TCP listening sockets, localhost servers, process origins, and process control.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Refresh process list and listening sockets"
          >
            <span className={refreshing ? "animate-spin" : ""}>🔄</span>
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* 2. Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 shrink-0">
        {/* Card 1: System Listening Ports */}
        <div
          onClick={() => setViewMode("ports")}
          className={`p-3.5 rounded-lg border flex items-center justify-between shadow-xs cursor-pointer transition-all ${
            viewMode === "ports"
              ? "bg-[#1D2129] border-[#8CA9CF]/50 ring-1 ring-[#8CA9CF]/30"
              : "bg-[#1D2129] border-[#303642] hover:border-[#8CA9CF]/30"
          }`}
        >
          <div>
            <div className="text-[11px] font-medium text-[#A5ADBA] uppercase tracking-wider flex items-center gap-1.5">
              <span>Listening Ports</span>
              <span className="text-[10px] text-[#8CA9CF] font-mono">● Live</span>
            </div>
            <div className="text-lg font-semibold text-[#E8EBF1] mt-0.5">
              {systemPorts.length > 0 ? (
                <span>{systemPorts.length} Active Sockets</span>
              ) : (
                "None Detected"
              )}
            </div>
            <div className="text-[11px] font-mono text-[#7C8594] mt-0.5 truncate max-w-[240px]">
              {topListeningPorts.length > 0
                ? topListeningPorts.slice(0, 5).map((p) => `:${p}`).join(", ") +
                  (topListeningPorts.length > 5 ? ` +${topListeningPorts.length - 5}` : "")
                : "No open sockets"}
            </div>
          </div>
          <div className="w-9 h-9 rounded-md bg-[#272D38] border border-[#303642] flex items-center justify-center text-[#8CA9CF] text-sm">
            🌐
          </div>
        </div>

        {/* Card 2: DevDesk Managed Services */}
        <div
          onClick={() => setViewMode("managed")}
          className={`p-3.5 rounded-lg border flex items-center justify-between shadow-xs cursor-pointer transition-all ${
            viewMode === "managed"
              ? "bg-[#1D2129] border-[#77B58A]/50 ring-1 ring-[#77B58A]/30"
              : "bg-[#1D2129] border-[#303642] hover:border-[#77B58A]/30"
          }`}
        >
          <div>
            <div className="text-[11px] font-medium text-[#A5ADBA] uppercase tracking-wider">
              Managed Services
            </div>
            <div className="text-lg font-semibold text-[#E8EBF1] mt-0.5">
              {processes.length}{" "}
              <span className="text-xs font-normal text-[#77B58A]">
                ({activeManagedCount} running)
              </span>
            </div>
            <div className="text-[11px] text-[#7C8594] mt-0.5">
              Started from DevDesk Terminal
            </div>
          </div>
          <div className="w-9 h-9 rounded-md bg-[#272D38] border border-[#303642] flex items-center justify-center text-[#A5ADBA] text-sm">
            ⚙️
          </div>
        </div>

        {/* Card 3: Localhost Quick Summary */}
        <div className="p-3.5 rounded-lg bg-[#1D2129] border border-[#303642] flex items-center justify-between shadow-xs">
          <div>
            <div className="text-[11px] font-medium text-[#A5ADBA] uppercase tracking-wider">
              Web & App Ports
            </div>
            <div className="text-lg font-semibold text-[#77B58A] mt-0.5">
              {systemPorts.filter((p) => p.port >= 3000 && p.port <= 9999).length} Servers
            </div>
            <div className="text-[11px] font-mono text-[#7C8594] mt-0.5 truncate max-w-[240px]">
              {systemPorts
                .filter((p) => [3000, 5000, 5001, 5173, 8000, 8080].includes(p.port))
                .map((p) => `:${p.port}`)
                .join(", ") || "Ports 3000-9999"}
            </div>
          </div>
          <div className="w-9 h-9 rounded-md bg-[#272D38] border border-[#303642] flex items-center justify-center text-[#77B58A] text-sm">
            ⚡
          </div>
        </div>
      </div>

      {/* Feedback Banners */}
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

      {successMessage && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-950/50 border border-emerald-900/60 text-emerald-300 text-xs flex items-center justify-between gap-3 animate-in fade-in shrink-0">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-zinc-400 hover:text-zinc-200 px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. Primary Mode Navigation Tabs */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <button
          onClick={() => setViewMode("ports")}
          className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-2 ${
            viewMode === "ports"
              ? "bg-[#35465E] text-[#8CA9CF] border border-[#8CA9CF]/40 shadow-xs"
              : "text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] border border-transparent"
          }`}
        >
          <span>🌐</span>
          <span>System Listening Ports ({systemPorts.length})</span>
        </button>

        <button
          onClick={() => setViewMode("managed")}
          className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-2 ${
            viewMode === "managed"
              ? "bg-[#35465E] text-[#8CA9CF] border border-[#8CA9CF]/40 shadow-xs"
              : "text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] border border-transparent"
          }`}
        >
          <span>⚙️</span>
          <span>DevDesk Services ({processes.length})</span>
        </button>
      </div>

      {/* 4. Toolbar: Filters & Search */}
      <div className="p-3 rounded-t-lg bg-zinc-900/80 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 shadow-sm shrink-0">
        <div className="flex items-center gap-1.5">
          {viewMode === "managed" ? (
            <>
              <button
                onClick={() => setManagedFilter("all")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  managedFilter === "all"
                    ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                All ({processes.length})
              </button>
              <button
                onClick={() => setManagedFilter("active")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  managedFilter === "active"
                    ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Active ({activeManagedCount})
              </button>
              <button
                onClick={() => setManagedFilter("stopped")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  managedFilter === "stopped"
                    ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Stopped ({processes.length - activeManagedCount})
              </button>
            </>
          ) : (
            <div className="text-xs text-zinc-400 flex items-center gap-2">
              <span className="font-semibold text-zinc-300">All Listening Sockets</span>
              <span className="text-[11px] text-zinc-500">
                (Click any port to open in browser, or terminate with Kill)
              </span>
            </div>
          )}
        </div>

        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              viewMode === "ports"
                ? "Search port (e.g. 3000), process, directory, PID..."
                : "Search project, script, port, PID..."
            }
            className="w-64 sm:w-80 px-3 py-1.5 text-xs rounded-md bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1.5 text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 5. Main Content: System Ports Table OR Managed Services Table */}
      <div className="flex-1 min-h-[350px] border-x border-b border-zinc-800 rounded-b-lg bg-zinc-950/70 overflow-hidden flex flex-col mb-4">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-zinc-200 animate-spin mb-4" />
            <p className="text-sm font-medium text-zinc-300">Scanning TCP sockets & processes...</p>
            <p className="text-xs text-zinc-500 mt-1">Inspecting active listening ports and origins</p>
          </div>
        ) : viewMode === "ports" ? (
          /* SYSTEM PORTS VIEW */
          filteredSystemPorts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm font-mono text-zinc-400 mb-4 shadow-sm">
                🌐
              </div>
              <p className="text-sm font-semibold text-zinc-200">
                {searchQuery ? "No matching listening ports found" : "No Listening Ports Detected"}
              </p>
              <p className="text-xs text-zinc-400 mt-1 max-w-md leading-relaxed">
                {searchQuery
                  ? "Try adjusting your search query."
                  : "No applications or services are currently listening on any TCP ports."}
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-x-auto overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-zinc-900/40 text-zinc-400 font-mono text-[11px] uppercase tracking-wider select-none">
                    <th className="py-2.5 px-4 font-semibold">Port</th>
                    <th className="py-2.5 px-4 font-semibold">Process & PID</th>
                    <th className="py-2.5 px-4 font-semibold">Directory / Where</th>
                    <th className="py-2.5 px-4 font-semibold">Command Line</th>
                    <th className="py-2.5 px-4 font-semibold">Source</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 font-sans">
                  {filteredSystemPorts.map((p) => {
                    const isLocal =
                      p.address === "127.0.0.1" ||
                      p.address === "*" ||
                      p.address === "0.0.0.0" ||
                      p.address === "::" ||
                      p.address === "localhost";
                    const isKilling = killingPid === p.pid;

                    return (
                      <tr key={`${p.port}-${p.pid}`} className="hover:bg-[#272D38]/40 transition-colors">
                        {/* Port Column */}
                        <td className="py-3 px-4 font-mono">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-xs font-bold text-[#8CA9CF] bg-[#272D38] border border-[#303642] shadow-xs">
                              :{p.port}
                            </span>
                            {isLocal && (
                              <a
                                href={`http://localhost:${p.port}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#7C8594] hover:text-[#8CA9CF] text-xs transition"
                                title={`Open http://localhost:${p.port} in browser`}
                              >
                                ↗
                              </a>
                            )}
                            <span className="text-[10px] text-[#7C8594]">({p.address})</span>
                          </div>
                        </td>

                        {/* Process & PID Column */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-200">{p.processName}</span>
                            <span className="font-mono text-[11px] text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                              PID: {p.pid}
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">
                            User: {p.user} • {p.protocol}
                          </div>
                        </td>

                        {/* Directory / Where */}
                        <td className="py-3 px-4 max-w-[280px]">
                          {p.cwd ? (
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="truncate font-mono text-[11px] text-zinc-300" title={p.cwd}>
                                {p.cwd}
                              </span>
                              <button
                                onClick={() => handleReveal(p.cwd!)}
                                className="text-zinc-500 hover:text-zinc-200 text-xs p-0.5 cursor-pointer shrink-0"
                                title="Reveal in Finder"
                              >
                                📁
                              </button>
                            </div>
                          ) : (
                            <span className="text-zinc-600 text-xs font-mono">—</span>
                          )}
                        </td>

                        {/* Command Line */}
                        <td className="py-3 px-4 max-w-[240px]">
                          <span
                            className="font-mono text-[11px] text-zinc-400 truncate block select-all"
                            title={p.command || p.processName}
                          >
                            {p.command || p.processName}
                          </span>
                        </td>

                        {/* Source Tag */}
                        <td className="py-3 px-4">
                          {p.isDevDeskManaged ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950/70 text-emerald-300 border border-emerald-800/60">
                              <span>●</span>
                              <span>DevDesk</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800">
                              System
                            </span>
                          )}
                        </td>

                        {/* Action Column: Kill Process */}
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setConfirmKillTarget(p)}
                            disabled={isKilling}
                            className="px-2.5 py-1 rounded text-xs font-medium text-rose-300 bg-rose-950/50 border border-rose-800/60 hover:bg-rose-900/60 transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                            title={`Terminate process ${p.processName} (PID ${p.pid})`}
                          >
                            {isKilling ? (
                              <span className="w-2.5 h-2.5 rounded-full border border-rose-300 border-t-transparent animate-spin" />
                            ) : (
                              <span>✕</span>
                            )}
                            <span>Kill</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* MANAGED SERVICES VIEW */
          processes.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm font-mono text-zinc-400 mb-4 shadow-sm">
                ⚙️
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
              <p className="text-xs text-zinc-500 mt-1">Try adjusting your filter or search query.</p>
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
                      <tr key={proc.id} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-zinc-100">{proc.projectName}</div>
                          <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                            {proc.script ? `npm run ${proc.script}` : proc.command}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-400 text-xs">
                          {proc.pid ? proc.pid : "—"}
                        </td>
                        <td className="py-3 px-4">
                          {renderStatusBadge(proc.status, proc.exitCode)}
                        </td>
                        <td className="py-3 px-4">
                          {proc.ports && proc.ports.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {proc.ports.map((port) => (
                                <a
                                  key={port}
                                  href={`http://localhost:${port}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#272D38] text-[#8CA9CF] border border-[#303642] hover:border-[#8CA9CF]/40 transition"
                                >
                                  <span>:{port}</span>
                                  <span className="text-[9px] opacity-70">↗</span>
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span className="text-zinc-500 font-mono text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-400 text-xs">
                          {formatDuration(proc.startedAt, proc.stoppedAt)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {onNavigateToTerminal && (
                              <button
                                onClick={() =>
                                  onNavigateToTerminal({
                                    workspaceId: proc.workspaceId,
                                    projectId: proc.projectId,
                                    script: proc.script,
                                  })
                                }
                                className="px-2 py-1 rounded text-[11px] font-mono text-zinc-300 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-white transition cursor-pointer"
                                title="Open in Terminal view"
                              >
                                &gt;_ Terminal
                              </button>
                            )}

                            {isCanStop ? (
                              <button
                                onClick={() => handleStopManaged(proc)}
                                disabled={isActionLoading}
                                className="px-2.5 py-1 rounded text-xs font-medium text-rose-300 bg-rose-950/50 border border-rose-800/60 hover:bg-rose-900/60 transition cursor-pointer disabled:opacity-50"
                              >
                                Stop
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRestartManaged(proc)}
                                disabled={isActionLoading || !isCanRestart}
                                className="px-2.5 py-1 rounded text-xs font-medium text-emerald-300 bg-emerald-950/50 border border-emerald-800/60 hover:bg-emerald-900/60 transition cursor-pointer disabled:opacity-50"
                              >
                                Restart
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* 6. Kill Confirmation Modal */}
      {confirmKillTarget && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-[#1D2129] border border-[#303642] rounded-lg p-5 max-w-md w-full shadow-2xl text-[#E8EBF1]">
            <div className="flex items-center gap-2 text-[#E18B8B] font-semibold text-base mb-2">
              <span>⚠️</span>
              <span>Terminate Process</span>
            </div>

            <p className="text-xs text-[#A5ADBA] leading-relaxed mb-3">
              Are you sure you want to kill process{" "}
              <strong className="text-[#E8EBF1] font-mono">{confirmKillTarget.processName}</strong> (PID:{" "}
              <strong className="text-[#8CA9CF] font-mono">{confirmKillTarget.pid}</strong>) listening on port{" "}
              <strong className="text-[#8CA9CF] font-mono">:{confirmKillTarget.port}</strong>?
            </p>

            {confirmKillTarget.cwd && (
              <div className="mb-3 p-2 rounded bg-[#272D38] border border-[#303642] text-[11px] font-mono text-[#A5ADBA] truncate">
                <span className="text-[#7C8594] uppercase text-[10px] block font-sans">Location:</span>
                <span className="text-[#E8EBF1] select-all">{confirmKillTarget.cwd}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#303642]">
              <button
                type="button"
                onClick={() => setConfirmKillTarget(null)}
                className="px-3 py-1.5 rounded text-xs font-medium text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleKillSystemProcess(confirmKillTarget.pid, false)}
                disabled={killingPid !== null}
                className="px-3 py-1.5 rounded text-xs font-semibold text-[#101216] bg-[#E18B8B] hover:bg-[#e89d9d] transition cursor-pointer disabled:opacity-50"
              >
                {killingPid === confirmKillTarget.pid ? "Terminating..." : "Kill Process"}
              </button>
              <button
                type="button"
                onClick={() => handleKillSystemProcess(confirmKillTarget.pid, true)}
                disabled={killingPid !== null}
                className="px-3 py-1.5 rounded text-xs font-semibold text-white bg-red-700 hover:bg-red-600 transition cursor-pointer disabled:opacity-50"
                title="Force kill immediately with SIGKILL"
              >
                Force Kill (SIGKILL)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
