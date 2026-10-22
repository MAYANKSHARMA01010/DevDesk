"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import { useWorkspaceSubscription } from "@/services/workspaceSync";
import { ManagedProcess, ProcessLogEntry, ProcessStatus } from "@/types/process";

export interface TerminalTab {
  id: string;
  title: string;
  workspaceId: string;
  projectId: string;
  projectName: string;
  projectDisplayName?: string;
  script: string;
  customCommand: string;
  isCustom: boolean;
  processId: string | null;
  status: ProcessStatus | "idle";
  logs: ProcessLogEntry[];
  latestSeqId: number;
  autoScroll: boolean;
  createdAt: string;
}

interface TerminalViewProps {
  isActive?: boolean;
  initialSelection?: {
    workspaceId?: string;
    projectId?: string;
    script?: string;
  } | null;
}

const LOCAL_STORAGE_TABS_KEY = "devdesk_terminal_tabs_v2";
const LOCAL_STORAGE_ACTIVE_TAB_KEY = "devdesk_active_terminal_tab_v2";
const MAX_SAVED_LOGS_PER_TAB = 500;

function createDefaultTab(index = 1): TerminalTab {
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title: `Terminal ${index}`,
    workspaceId: "",
    projectId: "",
    projectName: "",
    projectDisplayName: "",
    script: "",
    customCommand: "",
    isCustom: false,
    processId: null,
    status: "idle",
    logs: [],
    latestSeqId: 0,
    autoScroll: true,
    createdAt: new Date().toISOString(),
  };
}

export function TerminalView({ isActive, initialSelection }: TerminalViewProps = {}) {
  // Workspaces state
  const [workspaces, setWorkspaces] = useState<WorkspaceWithProjects[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState<boolean>(true);

  useWorkspaceSubscription(setWorkspaces, isActive);

  // Tabs state
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [editingTabTitleId, setEditingTabTitleId] = useState<string | null>(null);
  const [editingTitleText, setEditingTitleText] = useState<string>("");

  // Scripts cache per project { [projectId]: Record<string, string> }
  const [projectScriptsCache, setProjectScriptsCache] = useState<
    Record<string, Record<string, string>>
  >({});
  const [loadingScripts, setLoadingScripts] = useState<boolean>(false);

  // Running processes map { [processId]: ManagedProcess }
  const [runningProcesses, setRunningProcesses] = useState<
    Record<string, ManagedProcess>
  >({});

  // UI action states
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState<boolean>(false);

  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<boolean>(false);
  const [, startTransition] = useTransition();

  // Active tab derived
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0] || null;

  // Active workspace and project derived for active tab
  const activeWorkspace =
    workspaces.find((w) => w.id === activeTab?.workspaceId) || null;
  const activeProject =
    activeWorkspace?.projects.find((p) => p.id === activeTab?.projectId) || null;

  // Active scripts for currently selected project in active tab
  const activeScripts = activeTab?.projectId
    ? projectScriptsCache[activeTab.projectId] || {}
    : {};

  // Active process object for currently active tab
  const activeProcess = activeTab?.processId
    ? runningProcesses[activeTab.processId] || null
    : null;

  // 1. Initialize workspaces, restore tabs from localStorage, and handle initialSelection
  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        setLoadingWorkspaces(true);
        const [loadedWorkspaces, initialProcesses] = await Promise.all([
          fetchWorkspaces(),
          fetchProcesses().catch(() => [] as ManagedProcess[]),
        ]);

        if (!mounted) return;
        setWorkspaces(loadedWorkspaces);

        // Build processes lookup map
        const procMap: Record<string, ManagedProcess> = {};
        for (const p of initialProcesses) {
          procMap[p.id] = p;
        }
        setRunningProcesses(procMap);

        // Restore tabs from localStorage
        let restoredTabs: TerminalTab[] = [];
        try {
          const stored = localStorage.getItem(LOCAL_STORAGE_TABS_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              restoredTabs = parsed.map((t) => ({
                ...t,
                // reconcile status with live processes if possible
                status:
                  t.processId && procMap[t.processId]
                    ? procMap[t.processId].status
                    : t.status === "running" || t.status === "starting"
                    ? "stopped"
                    : t.status,
              }));
            }
          }
        } catch {
          // ignore corrupted storage
        }

        // Heal and re-qualify restored tabs using freshly loaded workspace project data
        const allLoadedProjects = loadedWorkspaces.flatMap((w) => w.projects);
        restoredTabs = restoredTabs.map((t) => {
          const matchedProj = allLoadedProjects.find((p) => p.id === t.projectId);
          if (!matchedProj) return t;

          const projLabel = matchedProj.displayName || matchedProj.name;
          let newTitle = t.title;

          // If the title still uses the old raw name (e.g. "frontend: dev" or "frontend: term"), heal it
          const oldName = t.projectName || matchedProj.name;
          if (t.title.startsWith(`${oldName}:`) || t.title === oldName) {
            const suffix = t.title.includes(":") ? t.title.split(":").slice(1).join(":") : "term";
            newTitle = `${projLabel}:${suffix}`;
          }

          return {
            ...t,
            projectName: matchedProj.name,
            projectDisplayName: projLabel,
            title: newTitle,
          };
        });

        let initialActiveId = "";
        try {
          initialActiveId = localStorage.getItem(LOCAL_STORAGE_ACTIVE_TAB_KEY) || "";
        } catch {
          // ignore
        }

        // If an initialSelection was provided from outside (e.g. ProjectsView)
        if (initialSelection?.workspaceId && initialSelection?.projectId) {
          const targetWs = loadedWorkspaces.find((w) => w.id === initialSelection.workspaceId);
          const targetProj = targetWs?.projects.find((p) => p.id === initialSelection.projectId);

          if (targetWs && targetProj) {
            const projLabel = targetProj.displayName || targetProj.name;
            // Check if there is already a tab for this project
            const existingTab = restoredTabs.find(
              (t) =>
                t.projectId === targetProj.id &&
                (!initialSelection.script || t.script === initialSelection.script)
            );

            if (existingTab) {
              initialActiveId = existingTab.id;
            } else {
              // Create a dedicated tab for this selected project
              const newTab: TerminalTab = {
                ...createDefaultTab(restoredTabs.length + 1),
                title: `${projLabel}: ${initialSelection.script || "term"}`,
                workspaceId: targetWs.id,
                projectId: targetProj.id,
                projectName: targetProj.name,
                projectDisplayName: projLabel,
                script: initialSelection.script || "",
              };
              restoredTabs.push(newTab);
              initialActiveId = newTab.id;
            }
          }
        }

        // If no tabs were restored, create initial default Tab 1
        if (restoredTabs.length === 0) {
          const firstTab = createDefaultTab(1);
          restoredTabs = [firstTab];
          initialActiveId = firstTab.id;
        }

        // Validate active tab ID
        if (!restoredTabs.some((t) => t.id === initialActiveId)) {
          initialActiveId = restoredTabs[0].id;
        }

        setTabs(restoredTabs);
        setActiveTabId(initialActiveId);
      } catch (err: unknown) {
        if (!mounted) return;
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to initialize terminal"
        );
      } finally {
        if (mounted) setLoadingWorkspaces(false);
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  // 2. Handle external initialSelection updates when view is already mounted
  useEffect(() => {
    if (!initialSelection?.workspaceId || !initialSelection?.projectId || workspaces.length === 0) {
      return;
    }

    const targetWs = workspaces.find((w) => w.id === initialSelection.workspaceId);
    const targetProj = targetWs?.projects.find((p) => p.id === initialSelection.projectId);
    if (!targetWs || !targetProj) return;

    // Check if an existing tab matches
    const existingIndex = tabs.findIndex(
      (t) =>
        t.projectId === targetProj.id &&
        (!initialSelection.script || t.script === initialSelection.script)
    );

    if (existingIndex >= 0) {
      setActiveTabId(tabs[existingIndex].id);
    } else {
      const projLabel = targetProj.displayName || targetProj.name;
      // Create new tab
      const newTab: TerminalTab = {
        ...createDefaultTab(tabs.length + 1),
        title: `${projLabel}: ${initialSelection.script || "term"}`,
        workspaceId: targetWs.id,
        projectId: targetProj.id,
        projectName: targetProj.name,
        projectDisplayName: projLabel,
        script: initialSelection.script || "",
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
  }, [initialSelection, workspaces]);

  // 3. Save tabs to localStorage whenever tabs or active tab changes
  useEffect(() => {
    if (tabs.length === 0) return;
    try {
      // Save trimmed tabs to prevent localStorage overflow
      const trimmedTabs = tabs.map((t) => ({
        ...t,
        logs: t.logs.slice(-MAX_SAVED_LOGS_PER_TAB),
      }));
      localStorage.setItem(LOCAL_STORAGE_TABS_KEY, JSON.stringify(trimmedTabs));
      if (activeTabId) {
        localStorage.setItem(LOCAL_STORAGE_ACTIVE_TAB_KEY, activeTabId);
      }
    } catch {
      // ignore storage write errors
    }
  }, [tabs, activeTabId]);

  // 4. Fetch available scripts for active project when projectId changes
  useEffect(() => {
    if (!activeTab?.projectId) return;
    const projId = activeTab.projectId;

    if (projectScriptsCache[projId]) {
      return; // already cached
    }

    let mounted = true;

    async function loadScripts() {
      try {
        setLoadingScripts(true);
        const discovered = await fetchProjectScripts(projId);
        if (!mounted) return;
        setProjectScriptsCache((prev) => ({ ...prev, [projId]: discovered }));
      } catch {
        if (!mounted) return;
        setProjectScriptsCache((prev) => ({ ...prev, [projId]: {} }));
      } finally {
        if (mounted) setLoadingScripts(false);
      }
    }

    loadScripts();

    return () => {
      mounted = false;
    };
  }, [activeTab?.projectId, projectScriptsCache]);

  // 5. Global polling loop for ALL running processes across ALL tabs
  useEffect(() => {
    let mounted = true;

    async function pollAllProcesses() {
      if (pollingRef.current) return;
      pollingRef.current = true;

      try {
        // Collect all process IDs across all tabs that need polling
        const activeProcessIds = tabs
          .map((t) => t.processId)
          .filter((id): id is string => Boolean(id));

        if (activeProcessIds.length === 0) {
          return;
        }

        // Fetch overall process states
        const allProcs = await fetchProcesses().catch(() => [] as ManagedProcess[]);
        if (!mounted) return;

        const procMap: Record<string, ManagedProcess> = {};
        for (const p of allProcs) {
          procMap[p.id] = p;
        }
        setRunningProcesses(procMap);

        // Fetch logs for each tab with an active process
        for (const tab of tabs) {
          if (!tab.processId) continue;
          const currentProc = procMap[tab.processId];

          // Fetch incremental logs
          try {
            const result = await fetchProcessLogs(tab.processId, tab.latestSeqId);
            if (!mounted) return;

            if (result.logs.length > 0 || (currentProc && currentProc.status !== tab.status)) {
              setTabs((prevTabs) =>
                prevTabs.map((t) => {
                  if (t.id !== tab.id) return t;
                  const newLogs =
                    result.logs.length > 0 ? [...t.logs, ...result.logs] : t.logs;
                  return {
                    ...t,
                    logs: newLogs.slice(-2000), // maintain bounded buffer of 2000 lines
                    latestSeqId:
                      result.latestSequenceId > t.latestSeqId
                        ? result.latestSequenceId
                        : t.latestSeqId,
                    status: currentProc ? currentProc.status : result.status || t.status,
                  };
                })
              );
            }
          } catch {
            // ignore incremental log error
          }
        }
      } catch {
        // ignore polling error
      } finally {
        pollingRef.current = false;
      }
    }

    const interval = setInterval(pollAllProcesses, 800);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [tabs]);

  // 6. Auto-scroll active tab terminal logs to bottom
  useEffect(() => {
    if (!activeTab?.autoScroll || !terminalScrollRef.current) return;
    terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
  }, [activeTab?.logs, activeTab?.autoScroll]);

  function handleTerminalScroll() {
    if (!terminalScrollRef.current || !activeTab) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalScrollRef.current;
    const isBottom = scrollHeight - scrollTop - clientHeight < 40;

    if (activeTab.autoScroll !== isBottom) {
      updateActiveTab({ autoScroll: isBottom });
    }
    setShowScrollBottomBtn(!isBottom && activeTab.logs.length > 0);
  }

  function scrollToBottom() {
    if (!terminalScrollRef.current) return;
    terminalScrollRef.current.scrollTo({
      top: terminalScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
    updateActiveTab({ autoScroll: true });
    setShowScrollBottomBtn(false);
  }

  // Helper to update active tab properties
  function updateActiveTab(updates: Partial<TerminalTab>) {
    if (!activeTabId) return;
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, ...updates } : t))
    );
  }

  // Tab management: Add Tab, Close Tab, Rename Tab
  function handleAddTab() {
    const newTab = createDefaultTab(tabs.length + 1);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }

  async function handleCloseTab(tabIdToClose: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();

    const targetTab = tabs.find((t) => t.id === tabIdToClose);
    if (!targetTab) return;

    // If running, stop background process
    if (targetTab.processId && targetTab.status === "running") {
      stopProcess(targetTab.processId).catch(() => {});
    }

    const remaining = tabs.filter((t) => t.id !== tabIdToClose);

    if (remaining.length === 0) {
      // If closing last tab, reset to clean Tab 1
      const freshTab = createDefaultTab(1);
      setTabs([freshTab]);
      setActiveTabId(freshTab.id);
    } else {
      setTabs(remaining);
      if (activeTabId === tabIdToClose) {
        setActiveTabId(remaining[remaining.length - 1].id);
      }
    }
  }

  function handleStartRename(tab: TerminalTab, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingTabTitleId(tab.id);
    setEditingTitleText(tab.title);
  }

  function handleSaveRename() {
    if (!editingTabTitleId) return;
    const trimmed = editingTitleText.trim();
    if (trimmed.length > 0) {
      setTabs((prev) =>
        prev.map((t) => (t.id === editingTabTitleId ? { ...t, title: trimmed } : t))
      );
    }
    setEditingTabTitleId(null);
  }

  // Workspace & Project change in active tab
  function handleWorkspaceChange(wsId: string) {
    const ws = workspaces.find((w) => w.id === wsId);
    const firstProj = ws?.projects[0] || null;
    const projLabel = firstProj ? (firstProj.displayName || firstProj.name) : "";

    updateActiveTab({
      workspaceId: wsId,
      projectId: firstProj?.id || "",
      projectName: firstProj?.name || "",
      projectDisplayName: projLabel,
      script: "",
      title: firstProj ? `${projLabel}: term` : `Terminal ${tabs.length}`,
    });
  }

  function handleProjectChange(projId: string) {
    const proj = activeWorkspace?.projects.find((p) => p.id === projId);
    const projLabel = proj ? (proj.displayName || proj.name) : "";
    updateActiveTab({
      projectId: projId,
      projectName: proj?.name || "",
      projectDisplayName: projLabel,
      script: "",
      title: proj ? `${projLabel}: term` : activeTab?.title || "Terminal",
    });
  }

  // Script selection or custom command update
  function handleSelectScript(scriptKey: string) {
    if (!activeTab) return;
    const label = activeTab.projectDisplayName || activeTab.projectName;
    updateActiveTab({
      script: scriptKey,
      isCustom: false,
      title: label
        ? `${label}: ${scriptKey}`
        : scriptKey,
    });
  }

  // Process Actions: Start, Stop, Restart, Clear Logs, Export Logs
  async function handleStart() {
    if (!activeTab || !activeTab.projectId) return;

    const commandToRun = activeTab.isCustom ? activeTab.customCommand.trim() : "";
    const scriptToRun = activeTab.isCustom ? "" : activeTab.script;

    if (!commandToRun && !scriptToRun) {
      setErrorMessage("Please select a script or enter a custom command to run.");
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);

      // Add system log entry
      const startLog: ProcessLogEntry = {
        id: activeTab.latestSeqId + 1,
        timestamp: new Date().toISOString(),
        stream: "system",
        message: `[DevDesk] Starting: ${commandToRun || scriptToRun}...`,
      };

      const proc = await startProcess(
        activeTab.projectId,
        scriptToRun || undefined,
        commandToRun || undefined
      );

      const label = activeTab.projectDisplayName || activeTab.projectName;

      // Update active tab with running process info
      updateActiveTab({
        processId: proc.id,
        status: "starting",
        latestSeqId: startLog.id,
        logs: [...activeTab.logs, startLog],
        title: label
          ? `${label}: ${proc.script}`
          : proc.script,
      });

      setRunningProcesses((prev) => ({ ...prev, [proc.id]: proc }));
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to start process."
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStop() {
    if (!activeTab?.processId) return;

    try {
      setActionLoading(true);
      setErrorMessage(null);

      const updated = await stopProcess(activeTab.processId);
      updateActiveTab({ status: updated.status });
      setRunningProcesses((prev) => ({ ...prev, [updated.id]: updated }));
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to stop process."
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRestart() {
    if (!activeTab?.processId) return;

    try {
      setActionLoading(true);
      setErrorMessage(null);

      const restartLog: ProcessLogEntry = {
        id: activeTab.latestSeqId + 1,
        timestamp: new Date().toISOString(),
        stream: "system",
        message: "[DevDesk] Restarting process...",
      };

      updateActiveTab({
        logs: [...activeTab.logs, restartLog],
        latestSeqId: restartLog.id,
        status: "starting",
      });

      const updated = await restartProcess(activeTab.processId);
      updateActiveTab({
        processId: updated.id,
        status: updated.status,
      });
      setRunningProcesses((prev) => ({ ...prev, [updated.id]: updated }));
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to restart process."
      );
    } finally {
      setActionLoading(false);
    }
  }

  function handleClearLogs() {
    if (!activeTab) return;
    updateActiveTab({ logs: [], latestSeqId: 0 });
  }

  function handleExportLogs() {
    if (!activeTab || activeTab.logs.length === 0) return;
    const content = activeTab.logs
      .map((l) => `[${l.timestamp}] [${l.stream.toUpperCase()}] ${l.message}`)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTab.title.replace(/[^a-zA-Z0-9_-]/g, "_")}_logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getWorkspaceLabel(rootPath: string): string {
    const parts = rootPath.split(/[/\\]/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : rootPath;
  }

  function getScriptIcon(key: string, def?: string): string {
    if (key.startsWith("cargo:")) return "🦀";
    if (key.startsWith("go:")) return "🐹";
    if (key.startsWith("make:")) return "⚙️";
    if (key.startsWith("sh:")) return "🐚";
    if (key.startsWith("composer:")) return "🐘";
    if (key === "runserver" || key === "migrate" || key.endsWith(".py") || key.startsWith("pip")) {
      return "🐍";
    }
    if (key === "dev" || key === "start") return "⚡";
    if (key === "build") return "📦";
    if (key === "test") return "🧪";
    if (key === "lint" || key === "typecheck") return "🔍";
    return "📜";
  }

  // --- RENDER STATES ---

  // Loading initial workspaces
  if (loadingWorkspaces) {
    return (
      <div className="flex flex-col h-full p-6 text-zinc-100 w-full">
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
      <div className="flex flex-col h-full p-6 text-zinc-100 w-full">
        <div className="mb-6">
          <h2 className="text-xl font-semibold tracking-tight">Terminal</h2>
          <p className="text-xs text-zinc-400 mt-1">
            Run project scripts and monitor real-time output across multiple terminals.
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
    activeTab?.status === "running" || activeTab?.status === "starting";
  const scriptKeys = Object.keys(activeScripts);

  return (
    <div className="flex flex-col h-full p-6 text-zinc-100 w-full overflow-hidden">
      {/* 1. Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 shrink-0">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Terminal</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Multi-terminal manager: run scripts, monitor real-time output, and preserve session history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddTab}
            className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Open a new terminal session"
          >
            <span className="text-sm font-bold leading-none">+</span>
            <span>New Terminal</span>
          </button>
        </div>
      </div>

      {/* 2. Multi-Terminal Tab Bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-3 border-b border-zinc-800/80 shrink-0">
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          const isTabRunning = tab.status === "running";
          const isTabStarting = tab.status === "starting";
          const isTabFailed = tab.status === "failed";

          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-lg border-t border-x text-xs cursor-pointer select-none transition-all ${
                isActive
                  ? "bg-zinc-900 border-zinc-700 text-zinc-100 font-medium shadow-sm"
                  : "bg-zinc-950/60 border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50"
              }`}
              title={`Click to switch. Double-click to rename.\nStatus: ${tab.status}`}
            >
              {/* Status indicator dot */}
              <span className="relative flex h-2 w-2 shrink-0">
                {isTabRunning && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isTabRunning
                      ? "bg-emerald-500"
                      : isTabStarting
                      ? "bg-amber-400"
                      : isTabFailed
                      ? "bg-rose-500"
                      : "bg-zinc-600"
                  }`}
                />
              </span>

              {/* Title or inline edit */}
              {editingTabTitleId === tab.id ? (
                <input
                  type="text"
                  value={editingTitleText}
                  onChange={(e) => setEditingTitleText(e.target.value)}
                  onBlur={handleSaveRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveRename();
                    if (e.key === "Escape") setEditingTabTitleId(null);
                  }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-100 border border-zinc-600 text-xs w-28 focus:outline-none"
                />
              ) : (
                <span
                  onDoubleClick={(e) => handleStartRename(tab, e)}
                  title={tab.title || `Terminal ${idx + 1}`}
                  className="truncate max-w-[200px] font-mono text-[11px]"
                >
                  {tab.title || `Terminal ${idx + 1}`}
                </span>
              )}

              {/* Tab close button */}
              <button
                onClick={(e) => handleCloseTab(tab.id, e)}
                className="w-4 h-4 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition ml-1"
                title="Close terminal tab"
              >
                ×
              </button>
            </div>
          );
        })}

        {/* Plus Button */}
        <button
          onClick={handleAddTab}
          className="px-2 py-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 text-xs transition font-semibold"
          title="Add another terminal tab"
        >
          +
        </button>
      </div>

      {/* 3. Tab Configuration Toolbar (Workspace, Project, Script / Custom Command) */}
      <div className="flex flex-col gap-2.5 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 mb-3 shrink-0">
        {/* Row A: Selectors & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Workspace dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-zinc-400 uppercase">WS:</span>
              <select
                value={activeTab?.workspaceId || ""}
                onChange={(e) => handleWorkspaceChange(e.target.value)}
                disabled={isRunning}
                className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs hover:border-zinc-700 focus:outline-none disabled:opacity-50 cursor-pointer max-w-[160px] truncate"
              >
                <option value="">(Select Workspace)</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {getWorkspaceLabel(w.rootPath)}
                  </option>
                ))}
              </select>
            </div>

            {/* Project dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-zinc-400 uppercase">Project:</span>
              <select
                value={activeTab?.projectId || ""}
                onChange={(e) => handleProjectChange(e.target.value)}
                disabled={!activeTab?.workspaceId || isRunning}
                className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs hover:border-zinc-700 focus:outline-none disabled:opacity-50 cursor-pointer max-w-[280px] truncate"
              >
                <option value="">(Select Project)</option>
                {(activeWorkspace?.projects || [])
                  .slice()
                  .sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName || p.name} ({p.type})
                    </option>
                  ))}
              </select>
            </div>

            {/* Mode Toggle: Detected Scripts vs Custom Command */}
            <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-950 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => updateActiveTab({ isCustom: false })}
                className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                  !activeTab?.isCustom
                    ? "bg-zinc-800 text-zinc-100 shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Auto-Detected Scripts
              </button>
              <button
                type="button"
                onClick={() => updateActiveTab({ isCustom: true })}
                className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                  activeTab?.isCustom
                    ? "bg-zinc-800 text-zinc-100 shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Custom Command
              </button>
            </div>
          </div>

          {/* Action buttons (Start, Stop, Restart, Clear) */}
          <div className="flex items-center gap-2">
            {!isRunning ? (
              <button
                onClick={handleStart}
                disabled={actionLoading || !activeTab?.projectId}
                className="px-3.5 py-1.5 rounded-md text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 transition shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                {actionLoading ? (
                  <span className="w-3 h-3 rounded-full border border-emerald-950 border-t-transparent animate-spin" />
                ) : (
                  <span>▶</span>
                )}
                <span>Start</span>
              </button>
            ) : (
              <>
                <button
                  onClick={handleStop}
                  disabled={actionLoading}
                  className="px-3.5 py-1.5 rounded-md text-xs font-semibold text-rose-100 bg-rose-700/80 hover:bg-rose-600 disabled:opacity-50 transition shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  {actionLoading ? (
                    <span className="w-3 h-3 rounded-full border border-rose-200 border-t-transparent animate-spin" />
                  ) : (
                    <span>⏹</span>
                  )}
                  <span>Stop</span>
                </button>
                <button
                  onClick={handleRestart}
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-amber-200 bg-amber-950/60 border border-amber-800/60 hover:bg-amber-900/60 disabled:opacity-50 transition flex items-center gap-1 cursor-pointer"
                >
                  <span>↻</span>
                  <span>Restart</span>
                </button>
              </>
            )}

            <button
              onClick={handleClearLogs}
              disabled={!activeTab || activeTab.logs.length === 0}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-400 bg-zinc-950 border border-zinc-800 hover:text-zinc-200 hover:border-zinc-700 disabled:opacity-40 transition cursor-pointer"
              title="Clear terminal buffer for this tab"
            >
              Clear
            </button>

            <button
              onClick={handleExportLogs}
              disabled={!activeTab || activeTab.logs.length === 0}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-400 bg-zinc-950 border border-zinc-800 hover:text-zinc-200 hover:border-zinc-700 disabled:opacity-40 transition cursor-pointer"
              title="Download session logs"
            >
              Export
            </button>
          </div>
        </div>

        {/* Row B: Script selector OR Custom Command input */}
        <div className="pt-2 border-t border-zinc-800/60">
          {!activeTab?.isCustom ? (
            /* Auto-detected Scripts */
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-zinc-400 font-medium">Detected Scripts:</span>

              {loadingScripts ? (
                <span className="text-xs text-zinc-500 italic">Scanning project files...</span>
              ) : scriptKeys.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {scriptKeys.map((key) => {
                    const isSelected = activeTab?.script === key;
                    const def = activeScripts[key];
                    return (
                      <button
                        key={key}
                        onClick={() => handleSelectScript(key)}
                        disabled={isRunning}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium transition cursor-pointer ${
                          isSelected
                            ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/50 shadow-xs"
                            : "bg-zinc-950 text-zinc-300 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900"
                        } disabled:opacity-50`}
                        title={`Command: ${def}`}
                      >
                        <span>{getScriptIcon(key, def)}</span>
                        <span>{key}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className="text-xs text-zinc-500">
                  {activeTab?.projectId
                    ? "No standard scripts detected. Switch to 'Custom Command' to run any command."
                    : "Select a project above to discover scripts."}
                </span>
              )}
            </div>
          ) : (
            /* Custom Command Input */
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-cyan-400 font-bold">&gt;_</span>
              <input
                type="text"
                value={activeTab?.customCommand || ""}
                onChange={(e) => updateActiveTab({ customCommand: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isRunning) {
                    handleStart();
                  }
                }}
                disabled={isRunning}
                placeholder="Enter command to execute in project directory (e.g. pnpm test, python3 app.py, cargo run, git status)..."
                className="flex-1 px-3 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-600 text-xs font-mono focus:outline-none focus:border-cyan-500/70 disabled:opacity-50"
              />
              <span className="text-[11px] text-zinc-500 hidden sm:inline">Press Enter to run</span>
            </div>
          )}
        </div>
      </div>

      {/* Error message banner */}
      {errorMessage && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 mb-3 shrink-0">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-200 text-sm font-bold ml-2"
          >
            ×
          </button>
        </div>
      )}

      {/* 4. Terminal Output Window */}
      <div className="flex-1 min-h-0 flex flex-col rounded-lg bg-black/90 border border-zinc-800 shadow-xl overflow-hidden relative">
        {/* Terminal Title Bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/90 border-b border-zinc-800/80 text-[11px] text-zinc-400 shrink-0">
          <div className="flex items-center gap-2 truncate">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/80 inline-block" />
            <span className="font-mono text-zinc-300 font-medium truncate ml-1">
              {activeTab?.title || "Terminal"}
            </span>
            {activeProcess?.command && (
              <span className="font-mono text-zinc-500 truncate hidden md:inline">
                ({activeProcess.command})
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Status pill */}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                isRunning
                  ? "bg-emerald-950/70 text-emerald-300 border border-emerald-800/60"
                  : activeTab?.status === "failed"
                  ? "bg-rose-950/70 text-rose-300 border border-rose-800/60"
                  : "bg-zinc-800 text-zinc-400 border border-zinc-700"
              }`}
            >
              <span>●</span>
              <span className="uppercase">{activeTab?.status || "idle"}</span>
              {activeProcess?.pid && <span>(PID: {activeProcess.pid})</span>}
            </span>

            {/* Detected Ports */}
            {activeProcess?.ports && activeProcess.ports.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950/70 text-cyan-300 border border-cyan-800/60">
                <span>PORT:</span>
                <span>{activeProcess.ports.join(", ")}</span>
              </span>
            )}

            {/* Line count */}
            <span className="text-zinc-500 font-mono text-[10px]">
              {activeTab?.logs.length || 0} lines
            </span>

            {/* Auto-scroll toggle */}
            <button
              onClick={() => updateActiveTab({ autoScroll: !activeTab?.autoScroll })}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition ${
                activeTab?.autoScroll
                  ? "text-zinc-300 bg-zinc-800"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Toggle automatic scrolling to latest log output"
            >
              Scroll: {activeTab?.autoScroll ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Terminal Logs Area */}
        <div
          ref={terminalScrollRef}
          onScroll={handleTerminalScroll}
          className="flex-1 p-4 overflow-y-auto font-mono text-xs leading-relaxed select-text"
        >
          {activeTab && activeTab.logs.length > 0 ? (
            <div className="space-y-0.5">
              {activeTab.logs.map((log) => {
                const isErr = log.stream === "stderr";
                const isSys = log.stream === "system";

                return (
                  <div key={log.id} className="flex items-start gap-2 group hover:bg-zinc-900/40 px-1 rounded">
                    <span className="text-zinc-600 select-none text-[10px] shrink-0 w-16 text-right">
                      {new Date(log.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span
                      className={`text-[10px] select-none shrink-0 uppercase px-1 rounded ${
                        isSys
                          ? "text-cyan-400 bg-cyan-950/40"
                          : isErr
                          ? "text-rose-400 bg-rose-950/40"
                          : "text-zinc-500"
                      }`}
                    >
                      {log.stream}
                    </span>
                    <span
                      className={`whitespace-pre-wrap break-all flex-1 ${
                        isSys
                          ? "text-cyan-300 font-semibold"
                          : isErr
                          ? "text-rose-300"
                          : "text-zinc-200"
                      }`}
                    >
                      {log.message}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-zinc-600 select-none">
              <span className="font-mono text-3xl mb-2 text-zinc-700">&gt;_</span>
              <p className="text-sm font-medium text-zinc-400">Terminal Ready</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                Select a project and click <strong className="text-zinc-300">Start</strong> to launch a script, or enter a custom command.
              </p>
              <p className="text-[11px] text-zinc-600 mt-2">
                Open multiple terminals with <strong className="text-zinc-400">+ New Terminal</strong>. Sessions and outputs are automatically preserved.
              </p>
            </div>
          )}
        </div>

        {/* Scroll to bottom floating button */}
        {showScrollBottomBtn && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-6 px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-sans shadow-lg border border-zinc-700 flex items-center gap-1.5 transition cursor-pointer"
          >
            <span>↓</span>
            <span>Jump to Bottom</span>
          </button>
        )}
      </div>
    </div>
  );
}
