"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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

export interface IdeOption {
  id: string;
  name: string;
  shortName: string;
  icon: string;
}

export const AVAILABLE_IDES: IdeOption[] = [
  { id: "vscode", name: "Visual Studio Code", shortName: "VS Code", icon: "💻" },
  { id: "cursor", name: "Cursor", shortName: "Cursor", icon: "✨" },
  { id: "intellij", name: "IntelliJ IDEA", shortName: "IntelliJ", icon: "☕" },
  { id: "webstorm", name: "WebStorm", shortName: "WebStorm", icon: "🌐" },
  { id: "pycharm", name: "PyCharm", shortName: "PyCharm", icon: "🐍" },
  { id: "sublime", name: "Sublime Text", shortName: "Sublime", icon: "📝" },
  { id: "zed", name: "Zed", shortName: "Zed", icon: "⚡" },
  { id: "xcode", name: "Xcode", shortName: "Xcode", icon: "🛠️" },
  { id: "windsurf", name: "Windsurf", shortName: "Windsurf", icon: "🏄" },
  { id: "fleet", name: "Fleet", shortName: "Fleet", icon: "🚀" },
];

export type SortOption =
  | "name-asc"
  | "name-desc"
  | "type"
  | "git-first"
  | "runnable-first"
  | "path";

export type FilterMode = "all" | "git" | "runnable" | "nested";

type ViewStatus =
  | "loading_initial"
  | "idle"
  | "scanning"
  | "deleting"
  | "error";

interface RunningAction {
  path: string;
  action: "editor" | "finder";
}

interface ActionFeedback {
  path: string;
  message: string;
}

interface ProjectsViewProps {
  onNavigateToTerminal?: (selection: {
    workspaceId?: string;
    projectId?: string;
  }) => void;
  onNavigateToGit?: (selection: {
    workspaceId?: string;
    projectId?: string;
  }) => void;
}

export function isRunnableProject(p: SavedProject | DiscoveredProject): boolean {
  return Boolean(
    (p.packageManager && p.packageManager !== "unknown") ||
    (p.type && p.type !== "Generic" && p.type !== "Git Repository")
  );
}

export function ProjectsView({
  onNavigateToTerminal,
  onNavigateToGit,
}: ProjectsViewProps = {}) {
  const [workspaces, setWorkspaces] = useState<WorkspaceWithProjects[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [status, setStatus] = useState<ViewStatus>("loading_initial");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pathWarning, setPathWarning] = useState<string | null>(null);
  const [showForgetConfirm, setShowForgetConfirm] = useState<boolean>(false);

  // Search, Filter & Sort states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [filterType, setFilterType] = useState<string>("");
  const [filterPkg, setFilterPkg] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");

  // IDE states
  const [defaultIde, setDefaultIde] = useState<string>("vscode");
  const [openMenuForPath, setOpenMenuForPath] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
          setActiveWorkspaceId(loaded[0].id);
        } else {
          setActiveWorkspaceId(null);
        }
        setStatus("idle");
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

  // 3. Switch workspace from dropdown
  async function handleSwitchWorkspace(targetWorkspaceId: string) {
    if (targetWorkspaceId === activeWorkspaceId) return;

    if (!targetWorkspaceId) {
      setActiveWorkspaceId(null);
      setPathWarning(null);
      setActionError(null);
      setShowForgetConfirm(false);
      return;
    }

    setActiveWorkspaceId(targetWorkspaceId);
    setPathWarning(null);
    setActionError(null);
    setShowForgetConfirm(false);

    try {
      const updated = await markWorkspaceOpened(targetWorkspaceId);
      startTransition(() => {
        setWorkspaces((prev) => {
          const filtered = prev.filter((w) => w.id !== targetWorkspaceId);
          return [updated, ...filtered];
        });
      });
    } catch {
      // Non-critical timestamp update error
    }
  }

  // 4. Rescan current workspace
  async function handleRescan() {
    if (!activeWorkspace) return;

    setStatus("scanning");
    setErrorMessage(null);
    setPathWarning(null);
    setActionError(null);

    try {
      const rescanned = await scanAndSaveWorkspace(activeWorkspace.rootPath);
      startTransition(() => {
        setWorkspaces((prev) =>
          prev.map((w) => (w.id === rescanned.id ? rescanned : w))
        );
        setStatus("idle");
      });
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to rescan workspace.";

      if (
        errorMsg.includes("Directory not found") ||
        errorMsg.includes("ENOENT")
      ) {
        setStatus("idle");
        setPathWarning(
          `Workspace directory "${activeWorkspace.rootPath}" is no longer accessible on disk.`
        );
      } else {
        setStatus("error");
        setErrorMessage(errorMsg);
      }
    }
  }

  // 5. Forget workspace
  async function handleForgetWorkspace() {
    if (!activeWorkspace) return;

    const targetId = activeWorkspace.id;
    setStatus("deleting");
    setShowForgetConfirm(false);

    try {
      await forgetWorkspace(targetId);

      startTransition(() => {
        const remaining = workspaces.filter((w) => w.id !== targetId);
        setWorkspaces(remaining);
        setActiveWorkspaceId(remaining.length > 0 ? remaining[0].id : null);
        setStatus("idle");
      });
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to forget workspace.";
      setStatus("error");
      setErrorMessage(errorMsg);
    }
  }

  // Load default IDE preference from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("devdesk_default_ide");
      if (saved && AVAILABLE_IDES.some((i) => i.id === saved)) {
        setDefaultIde(saved);
      }
    }
  }, []);

  function handleSetDefaultIde(ideId: string) {
    setDefaultIde(ideId);
    if (typeof window !== "undefined") {
      localStorage.setItem("devdesk_default_ide", ideId);
    }
  }

  // Close IDE dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuForPath(null);
      }
    }
    if (openMenuForPath) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenuForPath]);

  // 6. Project Card Actions: Open in IDE (VS Code, Cursor, IntelliJ, WebStorm, etc.)
  async function handleOpenInEditor(projectPath: string, targetIde?: string) {
    const chosenIde = targetIde || defaultIde;
    const ideConfig =
      AVAILABLE_IDES.find((i) => i.id === chosenIde) || AVAILABLE_IDES[0];

    if (!window.electron?.openInEditor && !window.electron?.openInVSCode) {
      setActionError({
        path: projectPath,
        message: `${ideConfig.name} integration requires the desktop app.`,
      });
      return;
    }

    setRunningAction({ path: projectPath, action: "editor" });
    setActionError(null);

    try {
      const result = window.electron.openInEditor
        ? await window.electron.openInEditor(projectPath, chosenIde)
        : await window.electron.openInVSCode(projectPath);

      if (!result.success) {
        setActionError({
          path: projectPath,
          message:
            result.error ||
            `Failed to open in ${ideConfig.name}. Please ensure ${ideConfig.name} is installed on your system.`,
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : `Unexpected error launching ${ideConfig.name}.`;
      setActionError({ path: projectPath, message });
    } finally {
      setRunningAction(null);
      setOpenMenuForPath(null);
    }
  }

  async function handleRevealInFinder(projectPath: string) {
    if (!window.electron?.revealInFinder) {
      setActionError({
        path: projectPath,
        message: "Reveal in Finder requires the desktop app.",
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
      case "Python":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/70 text-amber-300 border border-amber-800/60">
            Python
          </span>
        );
      case "Rust":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-orange-950/70 text-orange-300 border border-orange-800/60">
            Rust
          </span>
        );
      case "Go":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-cyan-950/70 text-cyan-300 border border-cyan-800/60">
            Go
          </span>
        );
      case "Java":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-red-950/70 text-red-300 border border-red-800/60">
            Java
          </span>
        );
      case "Ruby":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-rose-950/70 text-rose-300 border border-rose-800/60">
            Ruby
          </span>
        );
      case "PHP":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-950/70 text-indigo-300 border border-indigo-800/60">
            PHP
          </span>
        );
      case "Git Repository":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-950/70 text-purple-300 border border-purple-800/60">
            Git Repository
          </span>
        );
      case "Node.js":
      case "Generic":
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
            {type || "Node.js"}
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
      case "bun":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-pink-950/60 text-pink-300 border border-pink-800/50">
            bun
          </span>
        );
      case "cargo":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-orange-950/60 text-orange-300 border border-orange-800/50">
            cargo
          </span>
        );
      case "go":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-cyan-950/60 text-cyan-300 border border-cyan-800/50">
            go
          </span>
        );
      case "pip":
      case "poetry":
      case "pipenv":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-green-950/60 text-green-300 border border-green-800/50">
            {pm}
          </span>
        );
      case "maven":
      case "gradle":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-950/60 text-amber-300 border border-amber-800/50">
            {pm}
          </span>
        );
      case "gem":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-rose-950/60 text-rose-300 border border-rose-800/50">
            gem
          </span>
        );
      case "composer":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-indigo-950/60 text-indigo-300 border border-indigo-800/50">
            composer
          </span>
        );
      case "unknown":
      default:
        return null;
    }
  }

  function renderGitBadge(project: DiscoveredProject | SavedProject) {
    if (project.isGitRepo || project.isRoot) {
      const projId = "id" in project ? project.id : undefined;
      return (
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (activeWorkspace && onNavigateToGit) {
              onNavigateToGit({
                workspaceId: activeWorkspace.id,
                projectId: projId,
              });
            }
          }}
          title={
            project.gitRemote
              ? `Git Initialized\nRemote: ${project.gitRemote}\nClick to open Git Control (branches, diffs, commits)`
              : "Git Initialized\nClick to open Git Control (branches, diffs, commits)"
          }
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900/60 hover:border-emerald-700 cursor-pointer transition shadow-xs"
        >
          <svg className="w-3 h-3 text-emerald-400 shrink-0" fill="currentColor" viewBox="0 0 16 16">
            <path fillRule="evenodd" d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
          </svg>
          <span>Git</span>
        </span>
      );
    }
    return null;
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

  // Derived filtered & sorted projects
  const allProjects = activeWorkspace?.projects || [];
  const gitCount = allProjects.filter((p) => p.isGitRepo || p.isRoot).length;
  const runnableCount = allProjects.filter(isRunnableProject).length;
  const nestedCount = allProjects.filter((p) => p.relativePath && p.relativePath !== ".").length;

  const availableTypes = Array.from(
    new Set(allProjects.map((p) => p.type).filter(Boolean))
  ).sort();

  const availablePkgs = Array.from(
    new Set(
      allProjects
        .map((p) => p.packageManager)
        .filter((pm) => pm && pm !== "unknown")
    )
  ).sort();

  const currentIdeConfig =
    AVAILABLE_IDES.find((i) => i.id === defaultIde) || AVAILABLE_IDES[0];

  const hasActiveFilters =
    filterMode !== "all" ||
    Boolean(filterType) ||
    Boolean(filterPkg) ||
    Boolean(searchQuery.trim());

  const displayedProjects = allProjects
    .filter((p) => {
      if (filterMode === "git" && !p.isGitRepo && !p.isRoot) {
        return false;
      }
      if (filterMode === "runnable" && !isRunnableProject(p)) {
        return false;
      }
      if (filterMode === "nested" && (!p.relativePath || p.relativePath === ".")) {
        return false;
      }
      if (filterType && p.type !== filterType) {
        return false;
      }
      if (filterPkg && p.packageManager !== filterPkg) {
        return false;
      }
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(q);
        const matchPath = p.path.toLowerCase().includes(q);
        const matchRel = (p.relativePath || "").toLowerCase().includes(q);
        const matchType = p.type.toLowerCase().includes(q);
        const matchPkg = (p.packageManager || "").toLowerCase().includes(q);
        return matchName || matchPath || matchRel || matchType || matchPkg;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "type":
          return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
        case "git-first": {
          const aGit = a.isGitRepo || a.isRoot ? 1 : 0;
          const bGit = b.isGitRepo || b.isRoot ? 1 : 0;
          if (aGit !== bGit) return bGit - aGit;
          return a.name.localeCompare(b.name);
        }
        case "runnable-first": {
          const aRun = isRunnableProject(a) ? 1 : 0;
          const bRun = isRunnableProject(b) ? 1 : 0;
          if (aRun !== bRun) return bRun - aRun;
          return a.name.localeCompare(b.name);
        }
        case "path":
          return (
            (a.relativePath || "").localeCompare(b.relativePath || "") ||
            a.name.localeCompare(b.name)
          );
        case "name-asc":
        default:
          return a.name.localeCompare(b.name);
      }
    });

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
    <div className="flex flex-col h-full p-6 text-zinc-100 max-w-5xl overflow-y-auto">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Projects</h2>
          <p className="text-xs text-zinc-400 mt-1">
            Recursive multi-repository and nested project discovery.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Workspace Switcher dropdown if workspaces exist */}
          {workspaces.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-500 uppercase font-medium">Workspace:</span>
              <select
                value={activeWorkspaceId || ""}
                onChange={(e) => handleSwitchWorkspace(e.target.value)}
                disabled={status === "scanning" || status === "deleting"}
                className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-200 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all cursor-pointer max-w-[200px] truncate"
              >
                <option value="">None (Select Workspace)</option>
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
                title="Rescan current workspace recursively"
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
        <div className="mb-4 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 block">
                  Workspace Root
                </span>
                {activeWorkspace.lastScannedAt && (
                  <span className="text-[10px] text-zinc-500 font-mono">
                    • Last scanned: {formatTime(activeWorkspace.lastScannedAt)}
                  </span>
                )}
              </div>
              <span className="text-xs font-mono text-zinc-300 truncate block mt-0.5 select-all">
                {activeWorkspace.rootPath}
              </span>
            </div>
            <span className="shrink-0 text-xs text-zinc-300 px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 font-medium">
              {allProjects.length} {allProjects.length === 1 ? "Project Discovered" : "Projects Discovered"}
            </span>
          </div>
          <p className="text-[10px] text-zinc-500">
            Recursive scan up to 5 levels deep. Excluded node_modules, build caches, and .git internals.
          </p>
        </div>
      )}

      {/* 5. Search, Filter, Sort & Legend Bar */}
      {activeWorkspace && allProjects.length > 0 && (
        <div className="space-y-2.5 mb-5">
          {/* Row 1: Search & Filter Pills */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter projects by name, relative path, framework, or package manager..."
                className="w-full px-3 py-1.5 rounded-md text-xs bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:border-zinc-600 focus:outline-none text-zinc-200 placeholder-zinc-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 shrink-0 text-xs flex-wrap">
              <button
                onClick={() => setFilterMode("all")}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  filterMode === "all"
                    ? "bg-zinc-800 text-zinc-100 font-medium border border-zinc-700"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                All ({allProjects.length})
              </button>
              <button
                onClick={() => setFilterMode("git")}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                  filterMode === "git"
                    ? "bg-emerald-950/70 text-emerald-200 font-medium border border-emerald-800/80"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                <span>⎇</span>
                <span>Git Repos ({gitCount})</span>
              </button>
              <button
                onClick={() => setFilterMode("runnable")}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                  filterMode === "runnable"
                    ? "bg-cyan-950/70 text-cyan-200 font-medium border border-cyan-800/80"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                <span>&gt;_</span>
                <span>Runnable ({runnableCount})</span>
              </button>
              <button
                onClick={() => setFilterMode("nested")}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  filterMode === "nested"
                    ? "bg-zinc-800 text-zinc-100 font-medium border border-zinc-700"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                Nested ({nestedCount})
              </button>
            </div>
          </div>

          {/* Row 2: Sort Selector, Type Filter, Package Manager Filter & Default IDE */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-2 rounded-lg bg-zinc-900/40 border border-zinc-800/60 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {/* Sort By Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-zinc-500 uppercase font-medium">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 hover:border-zinc-700 focus:outline-none cursor-pointer text-xs"
                >
                  <option value="name-asc">Name (A → Z)</option>
                  <option value="name-desc">Name (Z → A)</option>
                  <option value="type">Framework / Type</option>
                  <option value="git-first">Git Repos First</option>
                  <option value="runnable-first">Runnable First</option>
                  <option value="path">Folder Path</option>
                </select>
              </div>

              {/* Type Filter Dropdown */}
              {availableTypes.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-zinc-500 uppercase font-medium">Type:</span>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 hover:border-zinc-700 focus:outline-none cursor-pointer text-xs"
                  >
                    <option value="">All Types ({allProjects.length})</option>
                    {availableTypes.map((t) => {
                      const count = allProjects.filter((p) => p.type === t).length;
                      return (
                        <option key={t} value={t}>
                          {t} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Package Manager Dropdown */}
              {availablePkgs.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-zinc-500 uppercase font-medium">Pkg:</span>
                  <select
                    value={filterPkg}
                    onChange={(e) => setFilterPkg(e.target.value)}
                    className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 hover:border-zinc-700 focus:outline-none cursor-pointer text-xs"
                  >
                    <option value="">All Managers</option>
                    {availablePkgs.map((pm) => {
                      const count = allProjects.filter((p) => p.packageManager === pm).length;
                      return (
                        <option key={pm} value={pm}>
                          {pm} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Reset Filters Button */}
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setFilterMode("all");
                    setFilterType("");
                    setFilterPkg("");
                  }}
                  className="px-2 py-1 rounded text-[11px] text-amber-400 hover:text-amber-300 bg-amber-950/30 border border-amber-900/50 hover:bg-amber-950/50 transition cursor-pointer"
                  title="Reset all filters and search"
                >
                  ✕ Reset Filters
                </button>
              )}
            </div>

            {/* Default IDE Selector */}
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[11px] text-zinc-500 uppercase font-medium">Default IDE:</span>
              <select
                value={defaultIde}
                onChange={(e) => handleSetDefaultIde(e.target.value)}
                className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 hover:border-zinc-700 focus:outline-none cursor-pointer text-xs"
                title="Select default IDE for opening projects"
              >
                {AVAILABLE_IDES.map((ide) => (
                  <option key={ide.id} value={ide.id}>
                    {ide.icon} {ide.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 3: Legend / Indicator Guide */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 rounded-lg bg-zinc-900/30 border border-zinc-800/50 text-[11px] text-zinc-400">
            <span className="text-zinc-500 font-semibold uppercase text-[10px] tracking-wider">
              Indicators:
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded font-mono text-[10px] bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 font-medium">
                <svg className="w-2.5 h-2.5 text-emerald-400" fill="currentColor" viewBox="0 0 16 16">
                  <path fillRule="evenodd" d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
                </svg>
                Git
              </span>
              <span>Git Initialized (click to view branches, status & diffs)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.2 rounded font-mono text-[10px] text-cyan-300 bg-cyan-950/60 border border-cyan-800/60 font-medium">
                &gt;_ Terminal
              </span>
              <span>Runnable project scripts</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.2 rounded font-mono text-[10px] text-violet-300 bg-violet-950/60 border border-violet-800/60 font-semibold uppercase">
                Workspace Root
              </span>
              <span>Top-level parent directory</span>
            </span>
          </div>
        </div>
      )}

      {/* 6. View States */}

      {/* State A: Scanning Active Workspace */}
      {status === "scanning" && (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-10 bg-zinc-900/20 text-center">
          <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-zinc-200 animate-spin mb-4" />
          <p className="text-sm font-medium text-zinc-200">Scanning workspace directories recursively...</p>
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

      {/* State C: No Workspace Selected or 0 Workspaces Configured */}
      {status === "idle" && !activeWorkspace && (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-10 bg-zinc-900/30 text-center">
          <div className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-base font-mono text-zinc-400 mb-4 shadow-sm">
            📁
          </div>
          <p className="text-sm font-semibold text-zinc-200">
            {workspaces.length === 0 ? "No Workspaces Configured" : "No Workspace Selected"}
          </p>
          <p className="text-xs text-zinc-400 mt-1 max-w-md leading-relaxed">
            {workspaces.length === 0
              ? "Select a project root directory to automatically discover React, Next.js, Node.js, Python, Rust, and Go projects, along with nested Git repositories."
              : "Select an existing workspace from the dropdown above, or choose a new directory."}
          </p>
          <button
            onClick={handleSelectNewDirectory}
            className="mt-6 px-4 py-2 rounded-md text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-zinc-200 transition-all shadow-sm cursor-pointer"
          >
            + Open Root Directory
          </button>
        </div>
      )}

      {/* State D: Empty scan result (Workspace exists, but 0 projects discovered) */}
      {status === "idle" && activeWorkspace && allProjects.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-10 bg-zinc-900/30 text-center">
          <div className="w-10 h-10 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm text-zinc-400 mb-3">
            📂
          </div>
          <p className="text-sm font-medium text-zinc-200">No projects found in this workspace.</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm leading-relaxed">
            None of the examined directories contained supported project markers or Git repositories.
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

      {/* State E: Filter returned 0 results */}
      {status === "idle" && activeWorkspace && allProjects.length > 0 && displayedProjects.length === 0 && (
        <div className="p-8 text-center border border-dashed border-zinc-800 rounded-lg bg-zinc-900/20">
          <p className="text-xs text-zinc-400">No projects match the current search or filter.</p>
          <button
            onClick={() => {
              setSearchQuery("");
              setFilterMode("all");
            }}
            className="mt-3 px-3 py-1 rounded text-xs bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* State F: Projects List */}
      {status === "idle" && activeWorkspace && displayedProjects.length > 0 && (
        <div className="space-y-3">
          {displayedProjects.map((project) => (
            <div
              key={project.path}
              className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 transition-all flex flex-col gap-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center flex-wrap gap-2">
                    <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">
                      {project.name}
                    </h3>

                    {project.isRoot && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider bg-violet-950/80 text-violet-300 border border-violet-800/70">
                        Workspace Root
                      </span>
                    )}

                    {project.relativePath && project.relativePath !== "." && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 px-2 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60">
                        <span>📁</span>
                        <span>{project.relativePath}</span>
                      </span>
                    )}

                    <div className="flex items-center gap-1.5 shrink-0">
                      {renderBadgeType(project.type)}
                      {renderBadgePkg(project.packageManager)}
                      {renderGitBadge(project)}
                    </div>
                  </div>

                  <p className="text-xs font-mono text-zinc-400 mt-1.5 truncate select-all">
                    {project.path}
                  </p>

                  {project.gitRemote && (
                    <p className="text-[11px] font-mono text-zinc-500 mt-0.5 truncate flex items-center gap-1">
                      <span>↳</span>
                      <span className="text-zinc-400">Remote:</span>
                      <span className="truncate">{project.gitRemote}</span>
                    </p>
                  )}
                </div>

                {/* Actions: Terminal (runnable only), Open in IDE, Reveal in Finder */}
                <div className="flex items-center flex-wrap gap-2 shrink-0">
                  {isRunnableProject(project) && onNavigateToTerminal && (
                    <button
                      onClick={() =>
                        onNavigateToTerminal({
                          workspaceId: activeWorkspace.id,
                          projectId: project.id,
                        })
                      }
                      className="px-2.5 py-1.5 rounded-md text-xs font-medium text-cyan-300 bg-cyan-950/40 border border-cyan-800/50 hover:bg-cyan-900/60 transition-all flex items-center gap-1 cursor-pointer"
                      title="Run scripts in Terminal"
                    >
                      <span className="font-mono text-[11px]">&gt;_</span>
                      <span>Terminal</span>
                    </button>
                  )}

                  {/* IDE Split Button: Open in Default IDE or pick another */}
                  <div className="relative inline-flex rounded-md shadow-sm">
                    <button
                      onClick={() => handleOpenInEditor(project.path)}
                      disabled={runningAction !== null}
                      className="px-2.5 py-1.5 rounded-l-md text-xs font-medium text-zinc-200 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 hover:text-white disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                      title={`Open in ${currentIdeConfig.name}`}
                    >
                      {runningAction?.path === project.path &&
                      runningAction.action === "editor" ? (
                        <span className="w-3 h-3 rounded-full border border-zinc-400 border-t-white animate-spin" />
                      ) : (
                        <span className="text-xs">{currentIdeConfig.icon}</span>
                      )}
                      <span>Open in {currentIdeConfig.shortName}</span>
                    </button>

                    <button
                      onClick={() =>
                        setOpenMenuForPath(
                          openMenuForPath === project.path ? null : project.path
                        )
                      }
                      disabled={runningAction !== null}
                      className="px-2 py-1.5 rounded-r-md text-xs font-medium text-zinc-400 bg-zinc-800 border-y border-r border-zinc-700 hover:bg-zinc-700 hover:text-white disabled:opacity-50 transition-all cursor-pointer"
                      title="Choose IDE or change default"
                    >
                      ▾
                    </button>

                    {openMenuForPath === project.path && (
                      <div
                        ref={menuRef}
                        className="absolute right-0 top-full mt-1 w-52 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl py-1 z-30 animate-in fade-in zoom-in-95 duration-100"
                      >
                        <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800 flex items-center justify-between">
                          <span>Open with IDE</span>
                        </div>
                        <div className="max-h-56 overflow-y-auto py-1">
                          {AVAILABLE_IDES.map((ide) => (
                            <button
                              key={ide.id}
                              onClick={() => handleOpenInEditor(project.path, ide.id)}
                              className="w-full text-left px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 flex items-center justify-between cursor-pointer transition-colors"
                            >
                              <span className="flex items-center gap-2">
                                <span>{ide.icon}</span>
                                <span>{ide.name}</span>
                              </span>
                              {ide.id === defaultIde && (
                                <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                                  Default
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                        <div className="border-t border-zinc-800 pt-1 px-1">
                          <div className="px-2 py-1 text-[10px] text-zinc-500">
                            Default: <strong className="text-zinc-200">{currentIdeConfig.name}</strong>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

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
