"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWorkspaces } from "@/services/projects";
import {
  fetchProcesses,
  fetchProcessLogs,
  fetchProjectScripts,
  restartProcess,
  startProcess,
  stopProcess,
} from "@/services/processes";
import { WorkspaceWithProjects } from "@/types/project";
import { ManagedProcess, ProcessLogEntry, ProcessStatus } from "@/types/process";

interface TerminalViewProps {
  initialSelection?: {
    workspaceId?: string;
    projectId?: string;
    script?: string;
  } | null;
}

export function TerminalView({ initialSelection }: TerminalViewProps = {}) {
  // Workspaces & Projects state
  const [workspaces, setWorkspaces] = useState<WorkspaceWithProjects[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(
    initialSelection?.workspaceId || ""
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    initialSelection?.projectId || ""
  );
  const [scripts, setScripts] = useState<Record<string, string>>({});
  const [selectedScript, setSelectedScript] = useState<string>(
    initialSelection?.script || ""
  );

  // Process and logs state
  const [activeProcess, setActiveProcess] = useState<ManagedProcess | null>(null);
  const [logs, setLogs] = useState<ProcessLogEntry[]>([]);
  const [latestSeqId, setLatestSeqId] = useState<number>(0);

  // Loading and error states
  const [loadingWorkspaces, setLoadingWorkspaces] = useState<boolean>(true);
  const [loadingScripts, setLoadingScripts] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-scroll control
  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const isAutoScrollEnabled = useRef<boolean>(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState<boolean>(false);

  // 1. Initial Load: Workspaces & existing running processes
  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        setLoadingWorkspaces(true);
        const [loadedWorkspaces, runningProcesses] = await Promise.all([
          fetchWorkspaces(),
          fetchProcesses().catch(() => [] as ManagedProcess[]),
        ]);

        if (!mounted) return;
        setWorkspaces(loadedWorkspaces);

        if (loadedWorkspaces.length > 0) {
          const targetWs =
            (initialSelection?.workspaceId &&
              loadedWorkspaces.find((w) => w.id === initialSelection.workspaceId)) ||
            loadedWorkspaces[0];

          setSelectedWorkspaceId(targetWs.id);

          if (targetWs.projects.length > 0) {
            const targetProj =
              (initialSelection?.projectId &&
                targetWs.projects.find((p) => p.id === initialSelection.projectId)) ||
              targetWs.projects[0];

            setSelectedProjectId(targetProj.id);

            // Check if there is an active process for this project
            const existingProc = runningProcesses.find(
              (p) =>
                p.projectId === targetProj.id &&
                (!initialSelection?.script || p.script === initialSelection.script) &&
                (p.status === "running" || p.status === "starting" || p.status === "stopping")
            );

            if (existingProc) {
              setActiveProcess(existingProc);
            }
          }
        }
      } catch (err: unknown) {
        if (!mounted) return;
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to load workspaces"
        );
      } finally {
        if (mounted) setLoadingWorkspaces(false);
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, [initialSelection]);

  // Selected workspace and project derived
  const activeWorkspace =
    workspaces.find((w) => w.id === selectedWorkspaceId) || null;
  const activeProject =
    activeWorkspace?.projects.find((p) => p.id === selectedProjectId) || null;

  // 2. Fetch available package.json scripts when selected project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setScripts({});
      setSelectedScript("");
      return;
    }

    let mounted = true;

    async function loadScripts() {
      try {
        setLoadingScripts(true);
        setErrorMessage(null);
        const discovered = await fetchProjectScripts(selectedProjectId);

        if (!mounted) return;
        setScripts(discovered);

        const scriptKeys = Object.keys(discovered);
        if (scriptKeys.length > 0) {
          if (initialSelection?.script && discovered[initialSelection.script]) {
            setSelectedScript(initialSelection.script);
          } else if (discovered["dev"]) {
            setSelectedScript("dev");
          } else {
            setSelectedScript(scriptKeys[0]);
          }
        } else {
          setSelectedScript("");
        }
      } catch (err: unknown) {
        if (!mounted) return;
        setScripts({});
        setSelectedScript("");
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to fetch scripts"
        );
      } finally {
        if (mounted) setLoadingScripts(false);
      }
    }

    loadScripts();

    return () => {
      mounted = false;
    };
  }, [selectedProjectId]);

  // 3. Match active process when project or script changes
  useEffect(() => {
    let mounted = true;

    async function checkCurrentProcess() {
      if (!selectedProjectId) return;

      try {
        const allProcs = await fetchProcesses();
        if (!mounted) return;

        // Find running or most recent process for this project & script
        const match = allProcs.find(
          (p) =>
            p.projectId === selectedProjectId &&
            (!selectedScript || p.script === selectedScript)
        );

        if (match) {
          setActiveProcess(match);
        } else {
          setActiveProcess(null);
          setLogs([]);
          setLatestSeqId(0);
        }
      } catch {
        // Non-fatal
      }
    }

    checkCurrentProcess();

    return () => {
      mounted = false;
    };
  }, [selectedProjectId, selectedScript]);

  // 4. Polling loop for active process logs
  useEffect(() => {
    if (!activeProcess?.id) return;

    let mounted = true;
    const processId = activeProcess.id;
    const isOngoing =
      activeProcess.status === "starting" ||
      activeProcess.status === "running" ||
      activeProcess.status === "stopping";

    async function pollLogs() {
      try {
        const result = await fetchProcessLogs(processId, latestSeqId);
        if (!mounted) return;

        if (result.logs.length > 0) {
          setLogs((prev) => [...prev, ...result.logs]);
          setLatestSeqId(result.latestSequenceId);
        }

        // Update status if process transitioned
        if (result.status !== activeProcess?.status) {
          setActiveProcess((prev) =>
            prev
              ? {
                  ...prev,
                  status: result.status,
                  exitCode: result.exitCode,
                }
              : null
          );
        }
      } catch {
        // Non-fatal logging fetch error
      }
    }

    // Immediate fetch on selection
    pollLogs();

    if (!isOngoing) return;

    // Poll every 750ms while running
    const interval = setInterval(pollLogs, 750);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [activeProcess?.id, activeProcess?.status, latestSeqId]);

  // 5. Smart auto-scroll to bottom
  useEffect(() => {
    if (!isAutoScrollEnabled.current || !terminalScrollRef.current) return;
    terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
  }, [logs]);

  function handleTerminalScroll() {
    if (!terminalScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalScrollRef.current;
    const isBottom = scrollHeight - scrollTop - clientHeight < 40;

    isAutoScrollEnabled.current = isBottom;
    setShowScrollBottomBtn(!isBottom && logs.length > 0);
  }

  function scrollToBottom() {
    if (!terminalScrollRef.current) return;
    terminalScrollRef.current.scrollTo({
      top: terminalScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
    isAutoScrollEnabled.current = true;
    setShowScrollBottomBtn(false);
  }

  // 6. Process actions: Start, Stop, Restart, Clear
  async function handleStart() {
    if (!selectedProjectId || !selectedScript) return;

    try {
      setActionLoading(true);
      setErrorMessage(null);

      // Clear logs display for clean session
      setLogs([]);
      setLatestSeqId(0);

      const proc = await startProcess(selectedProjectId, selectedScript);
      setActiveProcess(proc);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to start process"
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStop() {
    if (!activeProcess?.id) return;

    try {
      setActionLoading(true);
      setErrorMessage(null);
      const updated = await stopProcess(activeProcess.id);
      setActiveProcess(updated);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to stop process"
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRestart() {
    if (!activeProcess?.id) return;

    try {
      setActionLoading(true);
      setErrorMessage(null);
      setLogs([]);
      setLatestSeqId(0);

      const updated = await restartProcess(activeProcess.id);
      setActiveProcess(updated);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to restart process"
      );
    } finally {
      setActionLoading(false);
    }
  }

  function handleClearLogs() {
    setLogs([]);
  }

  function getWorkspaceLabel(rootPath: string): string {
    const parts = rootPath.split(/[/\\]/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : rootPath;
  }

  function renderStatusBadge(status?: ProcessStatus, exitCode?: number | null) {
    if (!status) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/60">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
          <span>Idle</span>
        </span>
      );
    }

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
            <span>Failed</span>
          </span>
        );
    }
  }

  function formatTime(isoString: string): string {
    try {
      const d = new Date(isoString);
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

  // --- RENDER STATES ---

  // Loading initial workspaces
  if (loadingWorkspaces) {
    return (
      <div className="flex flex-col h-full p-6 text-zinc-100 max-w-6xl">
        <div className="mb-6">
          <h2 className="text-xl font-semibold tracking-tight">Terminal</h2>
          <p className="text-xs text-zinc-400 mt-1">Connecting to workspace processes...</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-10 bg-zinc-900/20 text-center">
          <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-zinc-200 animate-spin mb-4" />
          <p className="text-sm font-medium text-zinc-200">Loading workspaces and projects...</p>
        </div>
      </div>
    );
  }

  // Empty state: No workspaces configured
  if (workspaces.length === 0) {
    return (
      <div className="flex flex-col h-full p-6 text-zinc-100 max-w-6xl">
        <div className="mb-6">
          <h2 className="text-xl font-semibold tracking-tight">Terminal</h2>
          <p className="text-xs text-zinc-400 mt-1">
            Run project scripts and monitor real-time output.
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-10 bg-zinc-900/30 text-center">
          <div className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-mono text-zinc-400 mb-4 shadow-sm">
            &gt;_
          </div>
          <p className="text-sm font-semibold text-zinc-200">No Workspaces Found</p>
          <p className="text-xs text-zinc-400 mt-1 max-w-md leading-relaxed">
            Scan and save a workspace root in the Projects tab before running project scripts.
          </p>
        </div>
      </div>
    );
  }

  const isRunning =
    activeProcess?.status === "running" || activeProcess?.status === "starting";
  const scriptKeys = Object.keys(scripts);

  return (
    <div className="flex flex-col h-full p-6 text-zinc-100 max-w-6xl">
      {/* 1. Header & Configuration Toolbar */}
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Terminal</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Execute package scripts and stream real-time process logs.
            </p>
          </div>

          {/* Process Status Badge */}
          <div className="flex items-center gap-2">
            {renderStatusBadge(activeProcess?.status, activeProcess?.exitCode)}
            {activeProcess?.pid && (
              <span className="text-[11px] font-mono text-zinc-500">
                PID: {activeProcess.pid}
              </span>
            )}
          </div>
        </div>

        {/* Workspace, Project, and Script Selectors Bar */}
        <div className="p-3 rounded-lg bg-zinc-900/70 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Workspace Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-500 uppercase font-medium">Workspace:</span>
              <select
                value={selectedWorkspaceId}
                onChange={(e) => {
                  setSelectedWorkspaceId(e.target.value);
                  const ws = workspaces.find((w) => w.id === e.target.value);
                  if (ws && ws.projects.length > 0) {
                    setSelectedProjectId(ws.projects[0].id);
                  } else {
                    setSelectedProjectId("");
                  }
                }}
                disabled={actionLoading}
                className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-200 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all cursor-pointer max-w-[160px] truncate"
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {getWorkspaceLabel(ws.rootPath)}
                  </option>
                ))}
              </select>
            </div>

            {/* Project Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-500 uppercase font-medium">Project:</span>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                disabled={actionLoading || !activeWorkspace || activeWorkspace.projects.length === 0}
                className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-200 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all cursor-pointer max-w-[160px] truncate"
              >
                {activeWorkspace?.projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Script Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-500 uppercase font-medium">Script:</span>
              <select
                value={selectedScript}
                onChange={(e) => setSelectedScript(e.target.value)}
                disabled={actionLoading || loadingScripts || scriptKeys.length === 0}
                className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-200 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all cursor-pointer max-w-[180px] truncate"
              >
                {loadingScripts ? (
                  <option value="">Loading scripts...</option>
                ) : scriptKeys.length > 0 ? (
                  scriptKeys.map((name) => (
                    <option key={name} value={name}>
                      {name} ({scripts[name]})
                    </option>
                  ))
                ) : (
                  <option value="">(No scripts found)</option>
                )}
              </select>
            </div>
          </div>

          {/* Action Buttons: Start, Stop, Restart, Clear */}
          <div className="flex items-center gap-2">
            {!isRunning ? (
              <button
                onClick={handleStart}
                disabled={actionLoading || loadingScripts || !selectedScript}
                className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                title="Start script process"
              >
                <span>▶</span>
                <span>Start</span>
              </button>
            ) : (
              <button
                onClick={handleStop}
                disabled={actionLoading || activeProcess?.status === "stopping"}
                className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                title="Stop running process (SIGTERM)"
              >
                <span>■</span>
                <span>Stop</span>
              </button>
            )}

            <button
              onClick={handleRestart}
              disabled={actionLoading || !activeProcess}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-300 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 hover:text-white disabled:opacity-40 transition-all cursor-pointer"
              title="Restart process"
            >
              Restart
            </button>

            <button
              onClick={handleClearLogs}
              disabled={logs.length === 0}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30 transition-all cursor-pointer"
              title="Clear terminal output"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Error notification banner */}
        {errorMessage && (
          <div className="p-3 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300 text-xs flex items-center justify-between gap-3 animate-in fade-in">
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
      </div>

      {/* 2. Terminal Panel */}
      <div className="flex-1 min-h-0 flex flex-col rounded-lg bg-zinc-950 border border-zinc-800 shadow-xl overflow-hidden relative">
        {/* Terminal Header Info Bar */}
        <div className="px-4 py-2 bg-zinc-900/80 border-b border-zinc-800/80 flex items-center justify-between text-xs font-mono text-zinc-400 select-none">
          <div className="flex items-center gap-2 truncate">
            <span className="text-zinc-500">&gt;_</span>
            {activeProject ? (
              <span className="text-zinc-300 truncate">
                {activeProject.name}
                {selectedScript ? ` → ${selectedScript}` : ""}
              </span>
            ) : (
              <span>No project selected</span>
            )}
            {activeProject && (
              <span className="text-zinc-500 text-[11px] truncate hidden md:inline">
                ({activeProject.path})
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0 text-[11px]">
            <span>{logs.length} lines</span>
          </div>
        </div>

        {/* Terminal Log Output Window */}
        <div
          ref={terminalScrollRef}
          onScroll={handleTerminalScroll}
          className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed space-y-0.5 select-text"
          style={{ wordBreak: "break-word" }}
        >
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500">
              <p className="text-xs">
                {isRunning
                  ? "Waiting for process output..."
                  : selectedScript
                  ? `Click "Start" to run "${selectedScript}"`
                  : "Select a project script to run"}
              </p>
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={`flex items-start gap-2.5 transition-colors ${
                  log.stream === "stderr"
                    ? "text-rose-400 font-medium"
                    : log.stream === "system"
                    ? "text-cyan-400 font-semibold"
                    : "text-zinc-200"
                }`}
              >
                <span className="text-[10px] text-zinc-600 shrink-0 select-none pt-0.5">
                  {formatTime(log.timestamp)}
                </span>
                <span className="flex-1 whitespace-pre-wrap">{log.message}</span>
              </div>
            ))
          )}
        </div>

        {/* Floating "Scroll to Bottom" button when user scrolled up */}
        {showScrollBottomBtn && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-6 px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-800/90 text-zinc-200 border border-zinc-700 shadow-lg hover:bg-zinc-700 transition-all flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
          >
            <span>↓</span>
            <span>Jump to latest</span>
          </button>
        )}
      </div>
    </div>
  );
}
