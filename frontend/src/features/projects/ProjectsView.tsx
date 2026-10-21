"use client";

import { useEffect, useState, useTransition } from "react";
import {
  fetchWorkspaces,
  forgetWorkspace,
  markWorkspaceOpened,
  scanAndSaveWorkspace,
} from "@/services/projects";
import {
  DiscoveredProject,
  SavedProject,
  WorkspaceWithProjects,
} from "@/types/project";

type ViewStatus =
  | "loading_initial"
  | "idle"
  | "scanning"
  | "deleting"
  | "error";

interface RunningAction {
  path: string;
  action: "vscode" | "finder";
}

interface ActionFeedback {
  path: string;
  message: string;
}

export function ProjectsView() {
  const [workspaces, setWorkspaces] = useState<WorkspaceWithProjects[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [status, setStatus] = useState<ViewStatus>("loading_initial");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pathWarning, setPathWarning] = useState<string | null>(null);
  const [showForgetConfirm, setShowForgetConfirm] = useState<boolean>(false);

  // Card-level action states
  const [runningAction, setRunningAction] = useState<RunningAction | null>(null);
  const [actionError, setActionError] = useState<ActionFeedback | null>(null);

  const [, startTransition] = useTransition();

  // Active workspace derived
  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) || null;

  // 1. Initial Load: fetch saved workspaces on mount
  useEffect(() => {
    let isMounted = true;

    async function loadWorkspaces() {
      try {
        const loaded = await fetchWorkspaces();
        if (!isMounted) return;

        setWorkspaces(loaded);
        if (loaded.length > 0) {
          // Restore most recently opened workspace
          setActiveWorkspaceId(loaded[0].id);
          setStatus("idle");
        } else {
          setActiveWorkspaceId(null);
          setStatus("idle");
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to connect to backend server.";
        setStatus("error");
        setErrorMessage(msg);
      }
    }

    loadWorkspaces();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Select a new workspace directory using native folder picker
  async function handleSelectNewDirectory() {
    if (!window.electron?.selectDirectory) {
      setStatus("error");
      setErrorMessage(
        "Native directory picker is only available in the DevDesk desktop app. Please run the desktop application."
      );
      return;
    }

    try {
      const chosenPath = await window.electron.selectDirectory();
      if (!chosenPath) return;

      setStatus("scanning");
      setErrorMessage(null);
      setPathWarning(null);
      setActionError(null);
      setShowForgetConfirm(false);

      // Call POST /api/workspaces/scan
      const saved = await scanAndSaveWorkspace(chosenPath);

      startTransition(() => {
        setWorkspaces((prev) => {
          const filtered = prev.filter((w) => w.id !== saved.id);
          return [saved, ...filtered];
        });
        setActiveWorkspaceId(saved.id);
        setStatus("idle");
      });
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to scan workspace root";
      setStatus("error");
      setErrorMessage(errorMsg);
    }
  }

  // 3. Rescan current workspace
  async function handleRescan() {
    if (!activeWorkspace) return;

    setStatus("scanning");
    setErrorMessage(null);
    setPathWarning(null);
    setActionError(null);

    try {
      const updated = await scanAndSaveWorkspace(activeWorkspace.rootPath);
      startTransition(() => {
        setWorkspaces((prev) =>
          prev.map((w) => (w.id === updated.id ? updated : w))
        );
        setStatus("idle");
      });
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to rescan workspace";

      if (errorMsg.includes("Directory not found") || errorMsg.includes("not found")) {
        setPathWarning(
          `Directory "${activeWorkspace.rootPath}" could not be found on disk. It may have been moved, renamed, or deleted.`
        );
        setStatus("idle");
      } else {
        setStatus("error");
        setErrorMessage(errorMsg);
      }
    }
  }

  // 4. Switch active workspace
  async function handleSwitchWorkspace(workspaceId: string) {
    if (workspaceId === activeWorkspaceId) return;

    setActiveWorkspaceId(workspaceId);
    setErrorMessage(null);
    setPathWarning(null);
    setActionError(null);
    setShowForgetConfirm(false);

    try {
      const updated = await markWorkspaceOpened(workspaceId);
      // Re-order active workspace to the top
      setWorkspaces((prev) => {
        const remaining = prev.filter((w) => w.id !== workspaceId);
        return [updated, ...remaining];
      });
    } catch {
      // Non-fatal if mark-opened fails; the UI still switches
    }
  }

  // 5. Forget Workspace (Removes database record only)
  async function handleForgetWorkspace() {
    if (!activeWorkspace) return;

    setStatus("deleting");
    setErrorMessage(null);
    setShowForgetConfirm(false);

    try {
      await forgetWorkspace(activeWorkspace.id);

      const remaining = workspaces.filter((w) => w.id !== activeWorkspace.id);
      setWorkspaces(remaining);
      setActiveWorkspaceId(remaining.length > 0 ? remaining[0].id : null);
      setPathWarning(null);
      setStatus("idle");
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to forget workspace";
      setStatus("error");
      setErrorMessage(errorMsg);
    }
  }

  // 6. Action: Open in VS Code
  async function handleOpenInVSCode(projectPath: string) {
    if (!window.electron?.openInVSCode) {
      setActionError({
        path: projectPath,
        message: "VS Code action is only supported inside the DevDesk desktop app.",
      });
      return;
    }

    setRunningAction({ path: projectPath, action: "vscode" });
    setActionError(null);

    try {
      const result = await window.electron.openInVSCode(projectPath);
      if (!result.success) {
        setActionError({
          path: projectPath,
          message: result.error || "Failed to launch Visual Studio Code.",
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Unexpected error launching VS Code.";
      setActionError({ path: projectPath, message });
    } finally {
      setRunningAction(null);
    }
  }

  // 7. Action: Reveal in Finder
  async function handleRevealInFinder(projectPath: string) {
    if (!window.electron?.revealInFinder) {
      setActionError({
        path: projectPath,
        message: "Reveal action is only supported inside the DevDesk desktop app.",
      });
      return;
    }

    setRunningAction({ path: projectPath, action: "finder" });
    setActionError(null);

    try {
      const result = await window.electron.revealInFinder(projectPath);
      if (!result.success) {
        setActionError({
          path: projectPath,
          message: result.error || "Failed to reveal in Finder.",
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Unexpected error revealing directory in Finder.";
      setActionError({ path: projectPath, message });
    } finally {
      setRunningAction(null);
    }
  }

  function renderBadgeType(type: DiscoveredProject["type"] | SavedProject["type"]) {
    switch (type) {
      case "Next.js":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-200 border border-zinc-700">
            Next.js
          </span>
        );
      case "React":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-sky-950/70 text-sky-300 border border-sky-800/60">
            React
          </span>
        );
      case "Node.js / Express":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/70 text-emerald-300 border border-emerald-800/60">
            Express
          </span>
        );
      case "Node.js":
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
            Node.js
          </span>
        );
    }
  }

  function renderBadgePkg(pm: DiscoveredProject["packageManager"] | SavedProject["packageManager"]) {
    switch (pm) {
      case "pnpm":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-950/60 text-amber-300 border border-amber-800/50">
            pnpm
          </span>
        );
      case "npm":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-red-950/60 text-red-300 border border-red-800/50">
            npm
          </span>
        );
      case "yarn":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-blue-950/60 text-blue-300 border border-blue-800/50">
            yarn
          </span>
        );
      case "unknown":
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono text-zinc-400 bg-zinc-800/60 border border-zinc-700/50">
            unknown
          </span>
        );
    }
  }

  function formatTime(isoString?: string): string {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function getWorkspaceLabel(rootPath: string): string {
    const parts = rootPath.split(/[/\\]/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : rootPath;
  }

  // --- Render Views ---

  // State A: Initial Loading
  if (status === "loading_initial") {
    return (
      <div className="flex flex-col h-full p-6 text-zinc-100 max-w-5xl">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Projects</h2>
            <p className="text-xs text-zinc-400 mt-1">Loading saved workspaces from local database...</p>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-10 bg-zinc-900/20 text-center">
          <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-zinc-200 animate-spin mb-4" />
          <p className="text-sm font-medium text-zinc-200">Reading SQLite database...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 text-zinc-100 max-w-5xl">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Projects</h2>
          <p className="text-xs text-zinc-400 mt-1">
            Scan workspace directories and manage discovered projects.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Workspace Switcher dropdown if multiple workspaces exist */}
          {workspaces.length > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-500 uppercase font-medium">Workspace:</span>
              <select
                value={activeWorkspaceId || ""}
                onChange={(e) => handleSwitchWorkspace(e.target.value)}
                disabled={status === "scanning" || status === "deleting"}
                className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-200 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all cursor-pointer max-w-[200px] truncate"
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {getWorkspaceLabel(ws.rootPath)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeWorkspace && (
            <>
              <button
                onClick={handleRescan}
                disabled={status === "scanning" || status === "deleting" || runningAction !== null}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                title="Rescan current workspace projects"
              >
                {status === "scanning" && (
                  <span className="w-3 h-3 rounded-full border border-zinc-500 border-t-zinc-200 animate-spin" />
                )}
                <span>Rescan</span>
              </button>

              <button
                onClick={() => setShowForgetConfirm(true)}
                disabled={status === "scanning" || status === "deleting" || runningAction !== null}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 hover:bg-red-950/50 hover:border-red-900/60 hover:text-red-300 disabled:opacity-50 transition-all cursor-pointer"
                title="Remove workspace records from DevDesk"
              >
                Forget
              </button>
            </>
          )}

          <button
            onClick={handleSelectNewDirectory}
            disabled={status === "scanning" || status === "deleting" || runningAction !== null}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-100 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <span>+</span>
            <span>{activeWorkspace ? "Open Root" : "Select Project Root"}</span>
          </button>
        </div>
      </div>

      {/* 2. Forget Workspace Confirmation Modal/Banner */}
      {showForgetConfirm && activeWorkspace && (
        <div className="mb-6 p-4 rounded-lg bg-zinc-900/90 border border-amber-900/40 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150">
          <div>
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span className="text-xs font-semibold">Forget this workspace?</span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              This will remove the workspace and project entries from DevDesk’s local database. Your files on disk will NOT be touched.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowForgetConfirm(false)}
              className="px-3 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 border border-zinc-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleForgetWorkspace}
              className="px-3 py-1 rounded text-xs font-medium text-red-200 bg-red-950 border border-red-800 hover:bg-red-900 cursor-pointer"
            >
              Yes, Forget Workspace
            </button>
          </div>
        </div>
      )}

      {/* 3. Nonexistent / Moved Directory Warning */}
      {pathWarning && (
        <div className="mb-6 p-4 rounded-lg bg-amber-950/20 border border-amber-900/50 text-amber-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span>⚠️</span>
            <span>{pathWarning}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRescan}
              className="px-2.5 py-1 rounded text-xs font-medium bg-amber-900/40 border border-amber-800 text-amber-200 hover:bg-amber-900/60 cursor-pointer"
            >
              Retry
            </button>
            <button
              onClick={() => setShowForgetConfirm(true)}
              className="px-2.5 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              Forget
            </button>
          </div>
        </div>
      )}

      {/* 4. Active Workspace Root Monospace Bar */}
      {activeWorkspace && (
        <div className="mb-6 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 block">
                Project Root
              </span>
              {activeWorkspace.lastScannedAt && (
                <span className="text-[10px] text-zinc-500 font-mono">
                  • Last scanned: {formatTime(activeWorkspace.lastScannedAt)}
                </span>
              )}
            </div>
            <span className="text-xs font-mono text-zinc-300 truncate block mt-0.5">
              {activeWorkspace.rootPath}
            </span>
          </div>
          <span className="shrink-0 text-xs text-zinc-400 px-2 py-1 rounded bg-zinc-800/80 border border-zinc-700/60 font-medium">
            {activeWorkspace.projects.length} {activeWorkspace.projects.length === 1 ? "Project" : "Projects"}
          </span>
        </div>
      )}

      {/* 5. View States */}

      {/* State A: Scanning Active Workspace */}
      {status === "scanning" && (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-10 bg-zinc-900/20 text-center">
          <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-zinc-200 animate-spin mb-4" />
          <p className="text-sm font-medium text-zinc-200">Scanning workspace directories...</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm font-mono truncate">
            {activeWorkspace?.rootPath}
          </p>
        </div>
      )}

      {/* State B: Global Error State */}
      {status === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center border border-red-900/30 rounded-lg p-10 bg-red-950/10 text-center">
          <div className="w-10 h-10 rounded-md bg-red-950/40 border border-red-800/50 flex items-center justify-center text-red-400 mb-3 text-base">
            ⚠️
          </div>
          <p className="text-sm font-semibold text-red-300">Workspace Operation Error</p>
          <p className="text-xs text-red-400/90 mt-1 max-w-md leading-relaxed">
            {errorMessage}
          </p>
          <button
            onClick={handleSelectNewDirectory}
            className="mt-5 px-3.5 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 transition-all cursor-pointer"
          >
            Select Project Root
          </button>
        </div>
      )}

      {/* State C: No Workspaces at all (Idle, 0 workspaces) */}
      {status === "idle" && !activeWorkspace && (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-10 bg-zinc-900/30 text-center">
          <div className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-base font-mono text-zinc-400 mb-4 shadow-sm">
            📁
          </div>
          <p className="text-sm font-semibold text-zinc-200">No Workspaces Configured</p>
          <p className="text-xs text-zinc-400 mt-1 max-w-md leading-relaxed">
            Select a project root directory to automatically discover React, Next.js, and Node.js workspaces. DevDesk will persist them locally.
          </p>
          <button
            onClick={handleSelectNewDirectory}
            className="mt-6 px-4 py-2 rounded-md text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-zinc-200 transition-all shadow-sm cursor-pointer"
          >
            Select Project Root
          </button>
        </div>
      )}

      {/* State D: Empty scan result (Workspace exists, but 0 projects discovered) */}
      {status === "idle" && activeWorkspace && activeWorkspace.projects.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-10 bg-zinc-900/30 text-center">
          <div className="w-10 h-10 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm text-zinc-400 mb-3">
            📂
          </div>
          <p className="text-sm font-medium text-zinc-200">No projects found in this workspace.</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm leading-relaxed">
            None of the immediate subdirectories contained a valid package.json file.
          </p>
          <div className="flex items-center gap-2 mt-5">
            <button
              onClick={handleRescan}
              className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 transition-all cursor-pointer"
            >
              Rescan Directory
            </button>
            <button
              onClick={handleSelectNewDirectory}
              className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 transition-all cursor-pointer"
            >
              Open Another Root
            </button>
          </div>
        </div>
      )}

      {/* State E: Projects List */}
      {status === "idle" && activeWorkspace && activeWorkspace.projects.length > 0 && (
        <div className="space-y-3 overflow-y-auto">
          {activeWorkspace.projects.map((project) => (
            <div
              key={project.path}
              className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 transition-all flex flex-col gap-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-sm font-semibold text-zinc-100 tracking-tight truncate">
                      {project.name}
                    </h3>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {renderBadgeType(project.type)}
                      {renderBadgePkg(project.packageManager)}
                    </div>
                  </div>
                  <p className="text-xs font-mono text-zinc-400 mt-1.5 truncate">
                    {project.path}
                  </p>
                </div>

                {/* Actions: Open in VS Code & Reveal in Finder */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleOpenInVSCode(project.path)}
                    disabled={runningAction !== null}
                    className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-200 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 hover:text-white disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Open project folder in Visual Studio Code"
                  >
                    {runningAction?.path === project.path &&
                    runningAction.action === "vscode" ? (
                      <span className="w-3 h-3 rounded-full border border-zinc-400 border-t-white animate-spin" />
                    ) : (
                      <span className="text-[11px] font-mono">&lt;/&gt;</span>
                    )}
                    <span>Open in VS Code</span>
                  </button>

                  <button
                    onClick={() => handleRevealInFinder(project.path)}
                    disabled={runningAction !== null}
                    className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-300 bg-zinc-900/90 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Reveal directory in Finder"
                  >
                    {runningAction?.path === project.path &&
                    runningAction.action === "finder" ? (
                      <span className="w-3 h-3 rounded-full border border-zinc-400 border-t-white animate-spin" />
                    ) : (
                      <span className="text-xs">↗</span>
                    )}
                    <span>Reveal in Finder</span>
                  </button>
                </div>
              </div>

              {/* Inline action error alert */}
              {actionError?.path === project.path && (
                <div className="flex items-center justify-between text-xs text-red-300 bg-red-950/40 border border-red-900/50 rounded px-3 py-1.5 mt-1">
                  <div className="flex items-center gap-1.5">
                    <span>⚠️</span>
                    <span>{actionError.message}</span>
                  </div>
                  <button
                    onClick={() => setActionError(null)}
                    className="text-zinc-400 hover:text-zinc-200 text-xs px-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
