"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  fetchWorkspaces,
  forgetWorkspace,
  markWorkspaceOpened,
  scanAndSaveWorkspace,
} from "@/services/projects";
import {
  broadcastWorkspacesChanged,
  useWorkspaceSubscription,
} from "@/services/workspaceSync";
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

export type SortField = "git" | "name" | "type" | "pkg" | "runnable" | "path";
export type SortDirection = "asc" | "desc";

export interface SortRule {
  id: string;
  field: SortField;
  direction: SortDirection;
}

export interface SortFieldMeta {
  field: SortField;
  label: string;
  ascLabel: string;
  descLabel: string;
  icon: string;
}

export const SORT_FIELD_OPTIONS: SortFieldMeta[] = [
  { field: "git", label: "Git Repository", ascLabel: "Git Repos First", descLabel: "Non-Git First", icon: "⎇" },
  { field: "name", label: "Project Name", ascLabel: "Name (A → Z)", descLabel: "Name (Z → A)", icon: "🔤" },
  { field: "type", label: "Framework / Type", ascLabel: "Type (A → Z)", descLabel: "Type (Z → A)", icon: "🏷️" },
  { field: "pkg", label: "Package Manager", ascLabel: "Pkg (A → Z)", descLabel: "Pkg (Z → A)", icon: "📦" },
  { field: "runnable", label: "Runnable Status", ascLabel: "Runnable First", descLabel: "Non-Runnable First", icon: "⚡" },
  { field: "path", label: "Folder Path", ascLabel: "Path (A → Z)", descLabel: "Path (Z → A)", icon: "📁" },
];

export const DEFAULT_SORT_RULES: SortRule[] = [
  { id: "rule-git", field: "git", direction: "asc" },
  { id: "rule-name", field: "name", direction: "asc" },
];

export type SortOption =
  | "name-asc"
  | "name-desc"
  | "type"
  | "pkg"
  | "git-first"
  | "runnable-first"
  | "path";

export type SecondarySortOption = "none" | SortOption;

export type FilterMode = "all" | "fullstack" | "aiml" | "git" | "runnable" | "nested";
export type ProjectCategory = "fullstack" | "aiml" | "git" | "runnable" | "nested";

export const SORT_FIELD_COMPACT: Record<SortField, { short: string; icon: string }> = {
  git: { short: "Git", icon: "⎇" },
  name: { short: "Name", icon: "🔤" },
  type: { short: "Type", icon: "🏷️" },
  pkg: { short: "Pkg", icon: "📦" },
  runnable: { short: "Runnable", icon: "⚡" },
  path: { short: "Path", icon: "📁" },
};

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
  isActive?: boolean;
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

export function compareProjectsByOption(
  a: SavedProject | DiscoveredProject,
  b: SavedProject | DiscoveredProject,
  option: SortOption
): number {
  const aLabel = a.displayName || a.name;
  const bLabel = b.displayName || b.name;

  switch (option) {
    case "name-desc":
      return bLabel.localeCompare(aLabel);
    case "type":
      return a.type.localeCompare(b.type);
    case "pkg": {
      const aPkg = a.packageManager || "";
      const bPkg = b.packageManager || "";
      return aPkg.localeCompare(bPkg);
    }
    case "git-first": {
      if (a.isRoot && !b.isRoot) return -1;
      if (!a.isRoot && b.isRoot) return 1;
      const aGit = a.isGitRepo ? 1 : 0;
      const bGit = b.isGitRepo ? 1 : 0;
      if (aGit !== bGit) return bGit - aGit;
      return 0;
    }
    case "runnable-first": {
      const aRun = isRunnableProject(a) ? 1 : 0;
      const bRun = isRunnableProject(b) ? 1 : 0;
      if (aRun !== bRun) return bRun - aRun;
      return 0;
    }
    case "path":
      return (a.relativePath || "").localeCompare(b.relativePath || "");
    case "name-asc":
    default:
      return aLabel.localeCompare(bLabel);
  }
}

export function compareProjectsByRules(
  a: SavedProject | DiscoveredProject,
  b: SavedProject | DiscoveredProject,
  rules: SortRule[]
): number {
  const aLabel = a.displayName || a.name;
  const bLabel = b.displayName || b.name;

  for (const rule of rules) {
    let diff = 0;
    switch (rule.field) {
      case "git": {
        if (a.isRoot && !b.isRoot) diff = -1;
        else if (!a.isRoot && b.isRoot) diff = 1;
        else {
          const aGit = a.isGitRepo ? 1 : 0;
          const bGit = b.isGitRepo ? 1 : 0;
          diff = bGit - aGit; // Git repos (1) before non-git (0)
        }
        break;
      }
      case "name":
        diff = aLabel.localeCompare(bLabel);
        break;
      case "runnable": {
        const aRun = isRunnableProject(a) ? 1 : 0;
        const bRun = isRunnableProject(b) ? 1 : 0;
        diff = bRun - aRun; // Runnable (1) before non-runnable (0)
        break;
      }
      case "type":
        diff = a.type.localeCompare(b.type);
        break;
      case "pkg": {
        const aPkg = a.packageManager || "";
        const bPkg = b.packageManager || "";
        diff = aPkg.localeCompare(bPkg);
        break;
      }
      case "path":
        diff = (a.relativePath || a.path || "").localeCompare(b.relativePath || b.path || "");
        break;
    }

    if (diff !== 0) {
      return rule.direction === "asc" ? diff : -diff;
    }
  }

  return aLabel.localeCompare(bLabel);
}

export function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}s`;
}

export function ProjectsView({
  isActive,
  onNavigateToTerminal,
  onNavigateToGit,
}: ProjectsViewProps = {}) {
  const [workspaces, setWorkspaces] = useState<WorkspaceWithProjects[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  useWorkspaceSubscription(setWorkspaces, isActive, (fresh) => {
    setActiveWorkspaceId((prev) => {
      if (prev && fresh.some((w) => w.id === prev)) return prev;
      if (typeof window !== "undefined") {
        const savedId =
          localStorage.getItem("devdesk_projects_last_active_workspace_id") ||
          localStorage.getItem("devdesk_last_selected_workspace_id");
        if (savedId && fresh.some((w) => w.id === savedId)) return savedId;
      }
      return fresh.length > 0 ? fresh[0].id : null;
    });
  });

  useEffect(() => {
    if (activeWorkspaceId && typeof window !== "undefined") {
      localStorage.setItem("devdesk_projects_last_active_workspace_id", activeWorkspaceId);
      localStorage.setItem("devdesk_last_selected_workspace_id", activeWorkspaceId);
    }
  }, [activeWorkspaceId]);
  const [status, setStatus] = useState<ViewStatus>("loading_initial");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pathWarning, setPathWarning] = useState<string | null>(null);
  const [showForgetConfirm, setShowForgetConfirm] = useState<boolean>(false);

  // Search, Filter & Sort states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<ProjectCategory[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedPkgs, setSelectedPkgs] = useState<string[]>([]);

  const [showTypeFilter, setShowTypeFilter] = useState<boolean>(false);
  const typeFilterRef = useRef<HTMLDivElement | null>(null);

  const [showPkgFilter, setShowPkgFilter] = useState<boolean>(false);
  const pkgFilterRef = useRef<HTMLDivElement | null>(null);

  const toggleCategory = (cat: ProjectCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const clearCategories = () => {
    setSelectedCategories([]);
  };

  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const togglePkg = (pkg: string) => {
    setSelectedPkgs((prev) =>
      prev.includes(pkg) ? prev.filter((p) => p !== pkg) : [...prev, pkg]
    );
  };

  // Multi-Level Sort Rules State
  const [sortRules, setSortRules] = useState<SortRule[]>(DEFAULT_SORT_RULES);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("devdesk_projects_multi_sort_rules");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSortRules(parsed);
          }
        } catch {
          // ignore
        }
      }
    }
  }, []);

  const [showSortManager, setShowSortManager] = useState<boolean>(false);
  const sortManagerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortManagerRef.current && !sortManagerRef.current.contains(e.target as Node)) {
        setShowSortManager(false);
      }
      if (typeFilterRef.current && !typeFilterRef.current.contains(e.target as Node)) {
        setShowTypeFilter(false);
      }
      if (pkgFilterRef.current && !pkgFilterRef.current.contains(e.target as Node)) {
        setShowPkgFilter(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSetSortRules = (rules: SortRule[]) => {
    setSortRules(rules);
    if (typeof window !== "undefined") {
      localStorage.setItem("devdesk_projects_multi_sort_rules", JSON.stringify(rules));
    }
  };

  const toggleRuleDirection = (ruleId: string) => {
    const updated = sortRules.map((r) =>
      r.id === ruleId
        ? { ...r, direction: (r.direction === "asc" ? "desc" : "asc") as SortDirection }
        : r
    );
    handleSetSortRules(updated);
  };

  const updateRuleField = (ruleId: string, newField: SortField) => {
    const updated = sortRules.map((r) =>
      r.id === ruleId ? { ...r, field: newField } : r
    );
    handleSetSortRules(updated);
  };

  const removeSortRule = (ruleId: string) => {
    if (sortRules.length <= 1) return; // Keep at least 1 rule
    const updated = sortRules.filter((r) => r.id !== ruleId);
    handleSetSortRules(updated);
  };

  const moveSortRule = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortRules.length) return;
    const copy = [...sortRules];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);
    handleSetSortRules(copy);
  };

  const addNextSortRule = () => {
    const usedFields = new Set(sortRules.map((r) => r.field));
    const nextFieldMeta = SORT_FIELD_OPTIONS.find((o) => !usedFields.has(o.field));
    if (!nextFieldMeta) return;

    const newRule: SortRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      field: nextFieldMeta.field,
      direction: "asc",
    };
    handleSetSortRules([...sortRules, newRule]);
  };

  const resetSortRules = () => {
    handleSetSortRules(DEFAULT_SORT_RULES);
  };

  // Configurable Scan Depth (1, 2, 3, 4, 5, 8, 10, 15, 20, 0=max/unlimited)
  const [scanDepth, setScanDepth] = useState<number>(5);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("devdesk_scan_depth");
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 0) setScanDepth(parsed);
      }
    }
  }, []);

  const handleSetScanDepth = (depth: number) => {
    setScanDepth(depth);
    if (typeof window !== "undefined") {
      localStorage.setItem("devdesk_scan_depth", depth.toString());
    }
  };

  const [scanningTarget, setScanningTarget] = useState<string>("");
  const [scanElapsedSeconds, setScanElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    if (status !== "scanning") {
      setScanElapsedSeconds(0);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      setScanElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 500);

    return () => clearInterval(interval);
  }, [status]);

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
      const lastPath =
        typeof window !== "undefined"
          ? localStorage.getItem("devdesk_last_selected_dir_path") || undefined
          : undefined;
      const chosenPath = await window.electron.selectDirectory(lastPath);
      if (!chosenPath) return;

      if (typeof window !== "undefined") {
        localStorage.setItem("devdesk_last_selected_dir_path", chosenPath);
      }

      setStatus("scanning");
      setScanningTarget(chosenPath);
      setErrorMessage(null);
      setPathWarning(null);
      setActionError(null);
      setShowForgetConfirm(false);

      // Call POST /api/workspaces/scan with configurable scan depth
      const saved = await scanAndSaveWorkspace(chosenPath, {
        maxDepth: scanDepth,
      });

      startTransition(() => {
        setWorkspaces((prev) => {
          const filtered = prev.filter((w) => w.id !== saved.id);
          return [saved, ...filtered];
        });
        setActiveWorkspaceId(saved.id);
        setStatus("idle");
      });
      broadcastWorkspacesChanged();
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to scan workspace root";
      setStatus("error");
      setErrorMessage(errorMsg);
    } finally {
      setScanningTarget("");
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
      broadcastWorkspacesChanged();
    } catch {
      // Non-critical timestamp update error
    }
  }

  // 4. Rescan current workspace
  async function handleRescan() {
    if (!activeWorkspace) return;

    setStatus("scanning");
    setScanningTarget(activeWorkspace.rootPath);
    setErrorMessage(null);
    setPathWarning(null);
    setActionError(null);

    try {
      const rescanned = await scanAndSaveWorkspace(activeWorkspace.rootPath, {
        maxDepth: scanDepth,
      });
      startTransition(() => {
        setWorkspaces((prev) =>
          prev.map((w) => (w.id === rescanned.id ? rescanned : w))
        );
        setStatus("idle");
      });
      broadcastWorkspacesChanged();
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
    } finally {
      setScanningTarget("");
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
      broadcastWorkspacesChanged();
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
      case "Fullstack":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[rgba(140,169,207,0.12)] text-[#8CA9CF] border border-[#8CA9CF]/35 shadow-xs">
            <span className="text-[10px]">⚡</span> Fullstack
          </span>
        );
      case "AI / ML / Deep Learning":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[rgba(140,169,207,0.12)] text-[#8CA9CF] border border-[#8CA9CF]/35 shadow-xs">
            <span className="text-[10px]">🧠</span> AI / ML / DL
          </span>
        );
      case "Python / FastAPI":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[rgba(140,169,207,0.12)] text-[#8CA9CF] border border-[#8CA9CF]/35 shadow-xs">
            <span className="text-[10px]">⚡</span> FastAPI
          </span>
        );
      case "Python / Django":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[rgba(119,181,138,0.12)] text-[#77B58A] border border-[#77B58A]/35 shadow-xs">
            <span className="text-[10px]">🐍</span> Django
          </span>
        );
      case "Python / Flask":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 shadow-xs">
            <span className="text-[10px]">🌶️</span> Flask
          </span>
        );
      case "Browser Extension":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-sky-950/80 text-sky-300 border border-sky-800/60 shadow-xs">
            <span className="text-[10px]">🧩</span> Extension
          </span>
        );
      case "Mobile":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-fuchsia-950/80 text-fuchsia-300 border border-fuchsia-800/60 shadow-xs">
            <span className="text-[10px]">📱</span> Mobile
          </span>
        );
      case "Desktop":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/80 text-amber-300 border border-amber-800/60 shadow-xs">
            <span className="text-[10px]">🖥️</span> Desktop
          </span>
        );
      case "Monorepo Package":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 shadow-xs">
            <span className="text-[10px]">📦</span> Package
          </span>
        );
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
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[rgba(140,169,207,0.15)] text-[#8CA9CF] border border-[#8CA9CF]/40">
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
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[rgba(140,169,207,0.12)] text-[#8CA9CF] border border-[#8CA9CF]/35">
            PHP
          </span>
        );
      case "Git Repository":
        return null;
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

  function renderBadgePkg(
    pm: DiscoveredProject["packageManager"] | SavedProject["packageManager"],
    projectType?: string
  ) {
    if (!pm || pm === "unknown") return null;

    // Suppress package manager badge if it duplicates the project type (e.g. type "Go" and pkg "go")
    if (projectType && projectType.trim().toLowerCase() === pm.trim().toLowerCase()) {
      return null;
    }

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
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[rgba(140,169,207,0.15)] text-[#8CA9CF] border border-[#8CA9CF]/40">
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
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[rgba(140,169,207,0.12)] text-[#8CA9CF] border border-[#8CA9CF]/35">
            composer
          </span>
        );
      default:
        return null;
    }
  }

  function renderGitBadge(project: DiscoveredProject | SavedProject) {
    if (project.isGitRepo || project.type === "Git Repository") {
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
              ? `Git Repository (Initialized)\nRemote: ${project.gitRemote}\nClick to open Git Control (branches, diffs, commits)`
              : "Git Repository (Initialized)\nClick to open Git Control (branches, diffs, commits)"
          }
          className="inline-flex items-center justify-center p-1 rounded text-[11px] font-mono font-medium bg-[rgba(119,181,138,0.12)] text-[#77B58A] border border-[#77B58A]/35 hover:bg-[rgba(119,181,138,0.2)] hover:border-[#77B58A]/60 cursor-pointer transition shadow-xs"
        >
          <svg className="w-3.5 h-3.5 text-[#77B58A] shrink-0" fill="currentColor" viewBox="0 0 16 16">
            <path fillRule="evenodd" d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
          </svg>
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
  const fullstackCount = allProjects.filter((p) => p.type === "Fullstack").length;
  const aimlCount = allProjects.filter((p) => p.type === "AI / ML / Deep Learning").length;
  const gitCount = allProjects.filter((p) => Boolean(p.isGitRepo) || p.type === "Git Repository").length;
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
    selectedCategories.length > 0 ||
    selectedTypes.length > 0 ||
    selectedPkgs.length > 0 ||
    Boolean(searchQuery.trim());

  const displayedProjects = allProjects
    .filter((p) => {
      // 1. Category multi-filtering
      if (selectedCategories.length > 0) {
        if (selectedCategories.includes("git") && !p.isGitRepo && p.type !== "Git Repository") {
          return false;
        }
        if (selectedCategories.includes("runnable") && !isRunnableProject(p)) {
          return false;
        }
        if (selectedCategories.includes("nested") && (!p.relativePath || p.relativePath === ".")) {
          return false;
        }
        const hasTypeCat =
          selectedCategories.includes("fullstack") || selectedCategories.includes("aiml");
        if (hasTypeCat) {
          const matchFullstack = selectedCategories.includes("fullstack") && p.type === "Fullstack";
          const matchAiml =
            selectedCategories.includes("aiml") && p.type === "AI / ML / Deep Learning";
          if (!matchFullstack && !matchAiml) {
            return false;
          }
        }
      }

      // 2. Framework / Type multi-select filtering
      if (selectedTypes.length > 0 && !selectedTypes.includes(p.type)) {
        return false;
      }

      // 3. Package Manager multi-select filtering
      if (selectedPkgs.length > 0 && !selectedPkgs.includes(p.packageManager || "")) {
        return false;
      }

      // 4. Search Query filter
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(q);
        const matchDisplayName = (p.displayName || "").toLowerCase().includes(q);
        const matchNamespace = (p.namespace || "").toLowerCase().includes(q);
        const matchPath = p.path.toLowerCase().includes(q);
        const matchRel = (p.relativePath || "").toLowerCase().includes(q);
        const matchType = p.type.toLowerCase().includes(q);
        const matchPkg = (p.packageManager || "").toLowerCase().includes(q);
        return (
          matchName ||
          matchDisplayName ||
          matchNamespace ||
          matchPath ||
          matchRel ||
          matchType ||
          matchPkg
        );
      }
      return true;
    })
    .sort((a, b) => compareProjectsByRules(a, b, sortRules));

  // --- Render Views ---

  // State A: Initial Loading
  if (status === "loading_initial") {
    return (
      <div className="flex flex-col h-full p-6 text-zinc-100 w-full">
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
    <div className="flex flex-col h-full p-6 text-zinc-100 w-full overflow-y-auto">
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

            {/* Scan Depth Selector */}
            <div className="flex items-center gap-1.5" title="Maximum directory depth to scan. 0 = Max / Complete unlimited recursive scan.">
              <span className="text-[11px] text-zinc-500 uppercase font-medium">Depth:</span>
              <select
                value={scanDepth}
                onChange={(e) => handleSetScanDepth(parseInt(e.target.value, 10))}
                disabled={status === "scanning" || status === "deleting"}
                className="px-2 py-1.5 rounded-md text-xs font-medium text-zinc-200 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all cursor-pointer"
              >
                <option value={1}>1 lvl (Root)</option>
                <option value={2}>2 lvls (Shallow)</option>
                <option value={3}>3 lvls</option>
                <option value={4}>4 lvls</option>
                <option value={5}>5 lvls (Default)</option>
                <option value={8}>8 lvls (Deep)</option>
                <option value={10}>10 lvls (Very Deep)</option>
                <option value={15}>15 lvls</option>
                <option value={20}>20 lvls</option>
                <option value={0}>⚡ Max (Complete Scan)</option>
              </select>
            </div>

            {activeWorkspace && (
            <>
              <button
                onClick={handleRescan}
                disabled={status === "scanning" || status === "deleting" || runningAction !== null}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                title={`Rescan workspace recursively (${scanDepth === 0 ? "Complete unlimited scan" : `up to ${scanDepth} levels deep`})`}
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
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500 pt-1 border-t border-zinc-800/50">
            <span>
              {scanDepth === 0
                ? "⚡ Complete recursive scan (unlimited depth, max level). Excluded node_modules, build caches, and .git internals."
                : `Recursive scan configured up to ${scanDepth} level${scanDepth === 1 ? "" : "s"} deep. Excluded node_modules, build caches, and .git internals.`}
            </span>
            <span className="font-mono text-zinc-400">
              Depth: {scanDepth === 0 ? "⚡ Max / Unlimited" : `${scanDepth} lvls`}
            </span>
          </div>
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
                type="button"
                onClick={clearCategories}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer select-none ${
                  selectedCategories.length === 0
                    ? "bg-[#272D38] text-[#E8EBF1] font-semibold border border-[#303642] shadow-xs"
                    : "text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] border border-transparent"
                }`}
                title="Show all projects without category restrictions"
              >
                All ({allProjects.length})
              </button>
              {fullstackCount > 0 && (
                <button
                  type="button"
                  onClick={() => toggleCategory("fullstack")}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 select-none ${
                    selectedCategories.includes("fullstack")
                      ? "bg-[#35465E] text-[#8CA9CF] font-medium border border-[#8CA9CF]/40 shadow-xs"
                      : "text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] border border-transparent"
                  }`}
                  title={
                    selectedCategories.includes("fullstack")
                      ? "Click to remove Fullstack filter"
                      : "Filter by Fullstack projects"
                  }
                >
                  <span>⚡</span>
                  <span>Fullstack ({fullstackCount})</span>
                  {selectedCategories.includes("fullstack") && (
                    <span className="text-[#8CA9CF] text-[10px]">✓</span>
                  )}
                </button>
              )}
              {aimlCount > 0 && (
                <button
                  type="button"
                  onClick={() => toggleCategory("aiml")}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 select-none ${
                    selectedCategories.includes("aiml")
                      ? "bg-[#35465E] text-[#8CA9CF] font-medium border border-[#8CA9CF]/40 shadow-xs"
                      : "text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] border border-transparent"
                  }`}
                  title={
                    selectedCategories.includes("aiml")
                      ? "Click to remove AI / ML / DL filter"
                      : "Filter by AI / ML / Deep Learning"
                  }
                >
                  <span>🧠</span>
                  <span>AI / ML / DL ({aimlCount})</span>
                  {selectedCategories.includes("aiml") && (
                    <span className="text-[#8CA9CF] text-[10px]">✓</span>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => toggleCategory("git")}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 select-none ${
                  selectedCategories.includes("git")
                    ? "bg-[#35465E] text-[#8CA9CF] font-medium border border-[#8CA9CF]/40 shadow-xs"
                    : "text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] border border-transparent"
                }`}
                title={
                  selectedCategories.includes("git")
                    ? "Click to remove Git filter"
                    : "Filter by Git repositories"
                }
              >
                <span>⎇</span>
                <span>Git Repos ({gitCount})</span>
                {selectedCategories.includes("git") && (
                  <span className="text-[#8CA9CF] text-[10px]">✓</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => toggleCategory("runnable")}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 select-none ${
                  selectedCategories.includes("runnable")
                    ? "bg-[#35465E] text-[#8CA9CF] font-medium border border-[#8CA9CF]/40 shadow-xs"
                    : "text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] border border-transparent"
                }`}
                title={
                  selectedCategories.includes("runnable")
                    ? "Click to remove Runnable filter"
                    : "Filter by Runnable projects"
                }
              >
                <span>&gt;_</span>
                <span>Runnable ({runnableCount})</span>
                {selectedCategories.includes("runnable") && (
                  <span className="text-[#8CA9CF] text-[10px]">✓</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => toggleCategory("nested")}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 select-none ${
                  selectedCategories.includes("nested")
                    ? "bg-[#35465E] text-[#8CA9CF] font-medium border border-[#8CA9CF]/40 shadow-xs"
                    : "text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] border border-transparent"
                }`}
                title={
                  selectedCategories.includes("nested")
                    ? "Click to remove Nested filter"
                    : "Filter by Nested sub-projects"
                }
              >
                <span>Nested ({nestedCount})</span>
                {selectedCategories.includes("nested") && (
                  <span className="text-[#8CA9CF] text-[10px]">✓</span>
                )}
              </button>
            </div>
          </div>

          {/* Row 2: Multi-Sort Selectors, Type Filter, Package Manager Filter & Default IDE */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 p-2 rounded-lg bg-[#171A20] border border-[#303642] text-xs">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              {/* Unified Multi-Sort Manager */}
              <div className="relative" ref={sortManagerRef}>
                <button
                  type="button"
                  onClick={() => setShowSortManager((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border flex items-center gap-1.5 transition cursor-pointer select-none ${
                    showSortManager
                      ? "bg-zinc-800 text-white border-zinc-600 shadow-sm"
                      : "bg-zinc-900 text-zinc-200 border-zinc-800 hover:border-zinc-700 hover:text-white"
                  }`}
                  title="Configure multi-level sorting (sort by multiple fields in priority order with custom ASC / DESC)"
                >
                  <span className="text-[#8CA9CF]">⇅</span>
                  <span className="font-semibold">Sort ({sortRules.length})</span>
                  <span className="text-[#7C8594] text-[10px]">▾</span>
                </button>

                {/* Popover / Panel for Sort Rules */}
                {showSortManager && (
                  <div className="absolute left-0 top-full mt-2 w-[340px] sm:w-[380px] bg-[#1D2129] border border-[#303642] rounded-lg p-4 shadow-2xl z-40 text-xs animate-in fade-in duration-150">
                    <div className="flex items-center justify-between pb-2.5 border-b border-[#303642] mb-3">
                      <div>
                        <h4 className="font-semibold text-[#E8EBF1] flex items-center gap-1.5">
                          <span className="text-[#8CA9CF]">⇅</span>
                          <span>Multi-Level Sorting</span>
                        </h4>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Sort by multiple criteria in priority order with custom ASC/DESC.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSortManager(false)}
                        className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-800 cursor-pointer text-xs"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Rules List */}
                    <div className="space-y-2 mb-3 max-h-[260px] overflow-y-auto pr-1">
                      {sortRules.map((rule, idx) => {
                        const meta = SORT_FIELD_OPTIONS.find((o) => o.field === rule.field);
                        const isAsc = rule.direction === "asc";

                        return (
                          <div
                            key={rule.id}
                            className="flex items-center justify-between gap-2 p-2 rounded-lg bg-zinc-950 border border-zinc-800/80"
                          >
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold shrink-0">
                              #{idx + 1}
                            </span>

                            {/* Field Select */}
                            <select
                              value={rule.field}
                              onChange={(e) => updateRuleField(rule.id, e.target.value as SortField)}
                              className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 focus:outline-none cursor-pointer flex-1 text-xs truncate"
                            >
                              {SORT_FIELD_OPTIONS.map((opt) => (
                                <option key={opt.field} value={opt.field}>
                                  {opt.icon} {opt.label}
                                </option>
                              ))}
                            </select>

                            {/* Direction Toggle */}
                            <button
                              type="button"
                              onClick={() => toggleRuleDirection(rule.id)}
                              className="px-2 py-1 rounded bg-[#272D38] border border-[#303642] hover:border-[#8CA9CF]/40 text-[#8CA9CF] hover:text-[#A6BDE0] font-mono text-[11px] font-semibold transition cursor-pointer shrink-0"
                              title={`Current: ${isAsc ? meta?.ascLabel : meta?.descLabel}. Click to toggle.`}
                            >
                              {isAsc ? `↑ ${meta?.ascLabel}` : `↓ ${meta?.descLabel}`}
                            </button>

                            {/* Move Up/Down & Remove */}
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => moveSortRule(idx, "up")}
                                className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                                title="Move up in priority"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                disabled={idx === sortRules.length - 1}
                                onClick={() => moveSortRule(idx, "down")}
                                className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                                title="Move down in priority"
                              >
                                ▼
                              </button>
                              <button
                                type="button"
                                disabled={sortRules.length <= 1}
                                onClick={() => removeSortRule(rule.id)}
                                className="w-5 h-5 flex items-center justify-center rounded text-[11px] text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none cursor-pointer ml-0.5"
                                title="Remove this rule"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Add Rule Button */}
                    {sortRules.length < SORT_FIELD_OPTIONS.length ? (
                      <button
                        type="button"
                        onClick={addNextSortRule}
                        className="w-full py-1.5 px-3 rounded-lg border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white bg-zinc-950/40 hover:bg-zinc-950 text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer mb-3"
                      >
                        <span>+</span>
                        <span>Add Sort Level</span>
                      </button>
                    ) : (
                      <p className="text-[10px] text-zinc-500 italic text-center mb-3">
                        All available fields are currently active.
                      </p>
                    )}

                    {/* Quick Presets */}
                    <div className="pt-2 border-t border-zinc-800">
                      <span className="text-[10px] text-zinc-500 uppercase font-semibold block mb-1.5">
                        Quick Presets:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            handleSetSortRules([
                              { id: "1", field: "git", direction: "asc" },
                              { id: "2", field: "name", direction: "asc" },
                            ]);
                          }}
                          className="px-2 py-0.5 rounded text-[10px] bg-zinc-950 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                        >
                          Git Repos + Name
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleSetSortRules([
                              { id: "1", field: "name", direction: "asc" },
                            ]);
                          }}
                          className="px-2 py-0.5 rounded text-[10px] bg-zinc-950 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                        >
                          Name (A → Z)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleSetSortRules([
                              { id: "1", field: "type", direction: "asc" },
                              { id: "2", field: "name", direction: "asc" },
                            ]);
                          }}
                          className="px-2 py-0.5 rounded text-[10px] bg-zinc-950 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                        >
                          Framework + Name
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleSetSortRules([
                              { id: "1", field: "runnable", direction: "asc" },
                              { id: "2", field: "name", direction: "asc" },
                            ]);
                          }}
                          className="px-2 py-0.5 rounded text-[10px] bg-zinc-950 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                        >
                          Runnable + Name
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleSetSortRules([
                              { id: "1", field: "path", direction: "asc" },
                              { id: "2", field: "name", direction: "asc" },
                            ]);
                          }}
                          className="px-2 py-0.5 rounded text-[10px] bg-zinc-950 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                        >
                          Folder Path + Name
                        </button>
                      </div>
                    </div>

                    {/* Popover Footer */}
                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-zinc-800 text-[11px]">
                      <button
                        type="button"
                        onClick={resetSortRules}
                        className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
                      >
                        Reset to Default
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSortManager(false)}
                        className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium cursor-pointer"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Compact Active Sort Rule Pills displayed right in toolbar */}
              <div className="flex items-center gap-1 flex-wrap">
                {sortRules.map((rule, idx) => {
                  const meta = SORT_FIELD_OPTIONS.find((o) => o.field === rule.field);
                  const isAsc = rule.direction === "asc";
                  const compactMeta =
                    SORT_FIELD_COMPACT[rule.field] || { short: meta?.label || rule.field, icon: "⇅" };
                  const dirLabel = isAsc ? meta?.ascLabel : meta?.descLabel;

                  return (
                    <span
                      key={rule.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] shadow-2xs hover:border-zinc-700 transition"
                      title={`Sort #${idx + 1}: ${meta?.label} (${dirLabel}). Click arrow to toggle, ✕ to remove.`}
                    >
                      <span className="text-zinc-500 font-mono text-[9px] font-semibold">#{idx + 1}</span>
                      <span className="text-zinc-400 text-xs">{compactMeta.icon}</span>
                      <span className="text-zinc-200 font-medium">{compactMeta.short}</span>
                      <button
                        type="button"
                        onClick={() => toggleRuleDirection(rule.id)}
                        className="text-[#8CA9CF] hover:text-[#A6BDE0] font-mono font-bold px-1 rounded hover:bg-[#272D38] cursor-pointer"
                        title={`Click to switch to ${isAsc ? meta?.descLabel : meta?.ascLabel}`}
                      >
                        {isAsc ? "↑" : "↓"}
                      </button>
                      {sortRules.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSortRule(rule.id)}
                          className="text-[#7C8594] hover:text-[#E18B8B] text-[10px] ml-0.5 cursor-pointer px-0.5 rounded hover:bg-[#272D38]"
                          title="Remove this sort level"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  );
                })}

                {sortRules.length < SORT_FIELD_OPTIONS.length && (
                  <button
                    type="button"
                    onClick={() => {
                      addNextSortRule();
                      setShowSortManager(true);
                    }}
                    className="px-2 py-0.5 rounded border border-dashed border-[#303642] hover:border-[#8CA9CF]/50 text-[#A5ADBA] hover:text-[#E8EBF1] text-[11px] transition cursor-pointer flex items-center gap-1"
                    title="Add another sort criterion"
                  >
                    <span>+</span>
                    <span>Add Level</span>
                  </button>
                )}
              </div>
            </div>

            {/* Right: Multi-Select Filter Popovers & Default IDE Selector */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {/* Type Multi-Select Filter Popover */}
              {availableTypes.length > 0 && (
                <div className="relative" ref={typeFilterRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTypeFilter((prev) => !prev);
                      setShowPkgFilter(false);
                      setShowSortManager(false);
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border flex items-center gap-1.5 transition cursor-pointer select-none ${
                      selectedTypes.length > 0
                        ? "bg-[#35465E] text-[#8CA9CF] border border-[#8CA9CF]/40 shadow-xs"
                        : "bg-[#272D38] text-[#E8EBF1] border-[#303642] hover:border-[#303642]"
                    }`}
                    title="Filter by one or more frameworks / types"
                  >
                    <span>🏷️</span>
                    <span>
                      {selectedTypes.length === 0
                        ? `Types (${allProjects.length})`
                        : selectedTypes.length === 1
                        ? selectedTypes[0]
                        : `Types (${selectedTypes.length})`}
                    </span>
                    <span className="text-[#7C8594] text-[10px]">▾</span>
                  </button>

                  {/* Type Filter Dropdown Panel */}
                  {showTypeFilter && (
                    <div className="absolute right-0 top-full mt-2 w-64 bg-[#1D2129] border border-[#303642] rounded-lg p-3 shadow-2xl z-40 text-xs animate-in fade-in duration-150">
                      <div className="flex items-center justify-between pb-2 border-b border-[#303642] mb-2">
                        <span className="font-semibold text-[#E8EBF1] flex items-center gap-1">
                          <span>🏷️</span> Framework / Type
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <button
                            type="button"
                            onClick={() => setSelectedTypes(availableTypes)}
                            className="text-[#8CA9CF] hover:text-[#A6BDE0] hover:underline cursor-pointer"
                          >
                            All
                          </button>
                          <span className="text-[#303642]">|</span>
                          <button
                            type="button"
                            onClick={() => setSelectedTypes([])}
                            className="text-[#A5ADBA] hover:text-[#E8EBF1] hover:underline cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                        {availableTypes.map((t) => {
                          const count = allProjects.filter((p) => p.type === t).length;
                          const isSelected = selectedTypes.includes(t);
                          return (
                            <label
                              key={t}
                              className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded cursor-pointer transition select-none ${
                                isSelected
                                  ? "bg-[#35465E] text-[#8CA9CF] font-medium border border-[#8CA9CF]/40"
                                  : "text-[#E8EBF1] hover:bg-[#272D38]"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleType(t)}
                                  className="rounded border-[#303642] bg-[#171A20] text-[#8CA9CF] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                />
                                <span className="truncate text-xs">{t}</span>
                              </div>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#272D38] text-[#A5ADBA] font-mono shrink-0">
                                {count}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Package Manager Multi-Select Filter Popover */}
              {availablePkgs.length > 0 && (
                <div className="relative" ref={pkgFilterRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPkgFilter((prev) => !prev);
                      setShowTypeFilter(false);
                      setShowSortManager(false);
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border flex items-center gap-1.5 transition cursor-pointer select-none ${
                      selectedPkgs.length > 0
                        ? "bg-[#35465E] text-[#8CA9CF] border border-[#8CA9CF]/40 shadow-xs"
                        : "bg-[#272D38] text-[#E8EBF1] border-[#303642] hover:border-[#8CA9CF]/40"
                    }`}
                    title="Filter by one or more package managers"
                  >
                    <span>📦</span>
                    <span>
                      {selectedPkgs.length === 0
                        ? "All Managers"
                        : selectedPkgs.length === 1
                        ? selectedPkgs[0]
                        : `Pkg (${selectedPkgs.length})`}
                    </span>
                    <span className="text-[#7C8594] text-[10px]">▾</span>
                  </button>

                  {/* Package Manager Dropdown Panel */}
                  {showPkgFilter && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-[#1D2129] border border-[#303642] rounded-xl p-3 shadow-2xl z-40 text-xs animate-in fade-in duration-150">
                      <div className="flex items-center justify-between pb-2 border-b border-[#303642] mb-2">
                        <span className="font-semibold text-[#E8EBF1] flex items-center gap-1">
                          <span>📦</span> Package Manager
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <button
                            type="button"
                            onClick={() => setSelectedPkgs(availablePkgs)}
                            className="text-[#8CA9CF] hover:text-[#A6BDE0] hover:underline cursor-pointer"
                          >
                            All
                          </button>
                          <span className="text-[#7C8594]">|</span>
                          <button
                            type="button"
                            onClick={() => setSelectedPkgs([])}
                            className="text-[#A5ADBA] hover:text-[#E8EBF1] hover:underline cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                        {availablePkgs.map((pm) => {
                          const count = allProjects.filter((p) => p.packageManager === pm).length;
                          const isSelected = selectedPkgs.includes(pm);
                          return (
                            <label
                              key={pm}
                              className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded cursor-pointer transition select-none ${
                                isSelected
                                  ? "bg-[#35465E] text-[#8CA9CF] font-medium border border-[#8CA9CF]/40"
                                  : "text-[#E8EBF1] hover:bg-[#272D38]"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => togglePkg(pm)}
                                  className="rounded border-[#303642] bg-[#171A20] text-[#8CA9CF] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                />
                                <span className="truncate text-xs">{pm}</span>
                              </div>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#272D38] text-[#A5ADBA] font-mono shrink-0">
                                {count}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Default IDE Selector */}
              <div className="flex items-center gap-1.5">
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
          </div>

          {/* Active Filters Row (shows when any filters are active) */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/40 border border-zinc-800/70 text-xs">
              <span className="text-[11px] text-zinc-500 font-medium">
                Active Filters ({displayedProjects.length} of {allProjects.length}):
              </span>

              {/* Selected Categories */}
              {selectedCategories.map((cat) => {
                const labelMap: Record<string, string> = {
                  fullstack: "⚡ Fullstack",
                  aiml: "🧠 AI / ML / DL",
                  git: "⎇ Git Repos",
                  runnable: ">_ Runnable",
                  nested: "📁 Nested",
                };
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition cursor-pointer"
                    title={`Remove category filter: ${labelMap[cat] || cat}`}
                  >
                    <span>{labelMap[cat] || cat}</span>
                    <span className="text-zinc-400 hover:text-white">✕</span>
                  </button>
                );
              })}

              {/* Selected Types */}
              {selectedTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-[rgba(140,169,207,0.12)] hover:bg-[rgba(140,169,207,0.18)] text-[#8CA9CF] border border-[#8CA9CF]/35 transition cursor-pointer"
                  title={`Remove type filter: ${t}`}
                >
                  <span>🏷️ {t}</span>
                  <span className="text-[#8CA9CF] hover:text-[#E8EBF1]">✕</span>
                </button>
              ))}

              {/* Selected Package Managers */}
              {selectedPkgs.map((pm) => (
                <button
                  key={pm}
                  type="button"
                  onClick={() => togglePkg(pm)}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-[rgba(140,169,207,0.12)] hover:bg-[rgba(140,169,207,0.18)] text-[#8CA9CF] border border-[#8CA9CF]/35 transition cursor-pointer"
                  title={`Remove package manager filter: ${pm}`}
                >
                  <span>📦 {pm}</span>
                  <span className="text-[#8CA9CF] hover:text-[#E8EBF1]">✕</span>
                </button>
              ))}

              {/* Search Query */}
              {searchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition cursor-pointer"
                  title="Clear search query"
                >
                  <span>&quot;{searchQuery.trim()}&quot;</span>
                  <span className="text-zinc-400 hover:text-white">✕</span>
                </button>
              )}

              {/* Reset All Filters Button */}
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  clearCategories();
                  setSelectedTypes([]);
                  setSelectedPkgs([]);
                }}
                className="ml-auto text-[11px] text-amber-400 hover:text-amber-300 hover:underline cursor-pointer font-medium"
                title="Reset all active search and filter criteria"
              >
                Clear all filters
              </button>
            </div>
          )}

          {/* Row 3: Legend / Indicator Guide with concise symbol labels */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-1.5 rounded-lg bg-[#171A20] border border-[#303642] text-[11px] text-[#A5ADBA]">
            <span className="text-[#7C8594] font-semibold uppercase text-[10px] tracking-wider">
              Symbols:
            </span>
            <span
              className="flex items-center gap-1.5 cursor-help"
              title="Git Repository (click symbol on project card to open in Git Control)"
            >
              <span className="inline-flex items-center justify-center p-1 rounded font-mono text-[10px] bg-[rgba(119,181,138,0.12)] text-[#77B58A] border border-[#77B58A]/35 font-medium shadow-xs">
                <svg className="w-3 h-3 text-[#77B58A] shrink-0" fill="currentColor" viewBox="0 0 16 16">
                  <path fillRule="evenodd" d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
                </svg>
              </span>
              <span>Git Control</span>
            </span>
            <span
              className="flex items-center gap-1.5 cursor-help"
              title="Terminal (click symbol to run project scripts in Terminal)"
            >
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded font-mono text-[11px] font-bold text-[#8CA9CF] bg-[rgba(140,169,207,0.12)] border border-[#8CA9CF]/35 shadow-xs">
                &gt;_
              </span>
              <span>Terminal</span>
            </span>
            <span
              className="flex items-center gap-1.5 cursor-help"
              title={`Open in ${currentIdeConfig.name} (change default IDE in toolbar above)`}
            >
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs bg-[#272D38] border border-[#303642] shadow-xs">
                {currentIdeConfig.icon}
              </span>
              <span>Open in IDE</span>
            </span>
            <span
              className="flex items-center gap-1.5 cursor-help"
              title="Reveal directory in Finder"
            >
              <span className="inline-flex items-center justify-center p-1 rounded bg-[#272D38] border border-[#303642] shadow-xs">
                <svg className="w-3 h-3 text-[#A5ADBA] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </span>
              <span>Reveal in Finder</span>
            </span>
            <span
              className="flex items-center gap-1.5 cursor-help"
              title="Name collision — hover icon on project card to see qualified path"
            >
              <span className="text-[10px] text-amber-400/80 select-none">⚡</span>
              <span>Collision</span>
            </span>
            <span
              className="flex items-center gap-1.5 cursor-help"
              title="Top-level parent directory of this workspace"
            >
              <span className="px-1.5 py-0.5 rounded font-mono text-[10px] text-[#8CA9CF] bg-[rgba(140,169,207,0.12)] border border-[#8CA9CF]/35 font-semibold uppercase">
                Root
              </span>
              <span>Workspace Root</span>
            </span>
          </div>
        </div>
      )}

      {/* 6. View States */}

      {/* State A: Scanning Active Workspace / Splash Waiting Screen */}
      {status === "scanning" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-in fade-in duration-150">
          <div className="bg-[#1D2129] border border-[#303642] rounded-xl max-w-lg w-full p-8 shadow-2xl relative flex flex-col items-center text-center">
            {/* Minimal Spinner */}
            <div className="relative w-14 h-14 mb-5 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full border-2 border-[#303642] border-t-[#8CA9CF] animate-spin" />
              <span className="absolute text-sm text-[#8CA9CF]">⚡</span>
            </div>

            {/* Title & Mode */}
            <h3 className="text-base font-semibold text-[#E8EBF1] tracking-tight">
              {scanDepth === 0 || scanDepth >= 20
                ? "Complete Deep Scan In Progress"
                : "Scanning Workspace Directories"}
            </h3>

            {/* Target Path */}
            <div className="mt-3 px-3 py-1.5 rounded bg-[#171A20] border border-[#303642] max-w-full">
              <span className="text-xs font-mono text-[#A5ADBA] truncate block select-all">
                {scanningTarget || activeWorkspace?.rootPath || "Selected Workspace Directory"}
              </span>
            </div>

            {/* Depth & Timer Metrics Bar */}
            <div className="mt-4 flex items-center justify-center gap-3 text-xs">
              <span className="px-2.5 py-1 rounded bg-[#272D38] border border-[#303642] text-[#E8EBF1] flex items-center gap-1.5 font-medium">
                <span>🔍</span>
                <span>
                  {scanDepth === 0
                    ? "Max Level (Unlimited Depth)"
                    : `${scanDepth} Levels Deep`}
                </span>
              </span>

              <span className="px-2.5 py-1 rounded bg-[#272D38] border border-[#303642] text-[#8CA9CF] font-mono flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#77B58A]" />
                <span>Elapsed: {formatSeconds(scanElapsedSeconds)}</span>
              </span>
            </div>

            {/* Dynamic Status / Progress Note based on elapsed seconds */}
            <p className="mt-5 text-xs text-[#A5ADBA] max-w-sm leading-relaxed min-h-[36px] flex items-center justify-center">
              {scanElapsedSeconds < 3
                ? "Indexing directory hierarchy and detecting project boundaries..."
                : scanElapsedSeconds < 7
                ? "Parsing package manifests (package.json, pyproject.toml, Cargo.toml, go.mod)..."
                : scanElapsedSeconds < 12
                ? "Analyzing nested Git repositories, worktrees, and remotes..."
                : "Deep recursive scan in progress... Scanning large workspace directory tree. Please wait."}
            </p>

            {/* Safety Notice */}
            <div className="mt-6 pt-4 border-t border-[#303642] text-[11px] text-[#7C8594] flex items-center gap-2">
              <span>🛡️</span>
              <span>Automatically skips node_modules, build outputs, and .git internals for speed.</span>
            </div>
          </div>
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
              clearCategories();
              setSelectedTypes([]);
              setSelectedPkgs([]);
            }}
            className="mt-3 px-3 py-1 rounded text-xs bg-zinc-800 text-zinc-200 hover:bg-zinc-700 cursor-pointer"
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
                    <h3 className="text-sm font-semibold text-zinc-100 tracking-tight flex items-center gap-1.5">
                      {project.namespace ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-zinc-400 font-medium">{project.namespace}</span>
                          <span className="text-zinc-600 font-mono text-xs">›</span>
                          <span className="text-zinc-100 font-semibold">{project.name}</span>
                        </span>
                      ) : (
                        <span>{project.displayName || project.name}</span>
                      )}
                      {project.hasNameCollision && (
                        <span
                          title={`Name collision resolved. Qualified as: ${project.displayName || project.name}`}
                          className="text-[10px] text-amber-400/80 cursor-help select-none"
                        >
                          ⚡
                        </span>
                      )}
                    </h3>

                    {project.isRoot && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider bg-[rgba(140,169,207,0.12)] text-[#8CA9CF] border border-[#8CA9CF]/35">
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
                      {renderBadgePkg(project.packageManager, project.type)}
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
                      className="px-2.5 py-1.5 rounded-md text-xs font-mono font-bold text-[#8CA9CF] bg-[#272D38] border border-[#303642] hover:border-[#8CA9CF]/50 hover:bg-[rgba(140,169,207,0.12)] transition-all flex items-center justify-center cursor-pointer shadow-xs"
                      title="Run scripts in Terminal"
                    >
                      &gt;_
                    </button>
                  )}

                  {/* IDE Split Button: Open in Default IDE or pick another (Symbol Only) */}
                  <div className="relative inline-flex rounded-md shadow-xs">
                    <button
                      onClick={() => handleOpenInEditor(project.path)}
                      disabled={runningAction !== null}
                      className="px-2.5 py-1.5 rounded-l-md text-xs font-medium text-zinc-200 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 hover:text-white disabled:opacity-50 transition-all flex items-center justify-center cursor-pointer shadow-xs"
                      title={`Open in ${currentIdeConfig.name} (Default IDE)`}
                    >
                      {runningAction?.path === project.path &&
                      runningAction.action === "editor" ? (
                        <span className="w-3.5 h-3.5 rounded-full border border-zinc-400 border-t-white animate-spin" />
                      ) : (
                        <span className="text-xs">{currentIdeConfig.icon}</span>
                      )}
                    </button>

                    <button
                      onClick={() =>
                        setOpenMenuForPath(
                          openMenuForPath === project.path ? null : project.path
                        )
                      }
                      disabled={runningAction !== null}
                      className="px-1.5 py-1.5 rounded-r-md text-xs font-medium text-zinc-400 bg-zinc-800 border-y border-r border-zinc-700 hover:bg-zinc-700 hover:text-white disabled:opacity-50 transition-all cursor-pointer"
                      title="Choose IDE or change default"
                    >
                      ▾
                    </button>

                    {openMenuForPath === project.path && (
                      <div
                        ref={menuRef}
                        className="absolute right-0 top-full mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl py-1 z-30 animate-in fade-in zoom-in-95 duration-100"
                      >
                        <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800 flex items-center justify-between">
                          <span>Open with IDE</span>
                          <span className="text-[9px] text-zinc-500 font-normal">Click to launch</span>
                        </div>
                        <div className="max-h-56 overflow-y-auto py-1">
                          {AVAILABLE_IDES.map((ide) => (
                            <button
                              key={ide.id}
                              onClick={() => {
                                handleOpenInEditor(project.path, ide.id);
                                setOpenMenuForPath(null);
                              }}
                              className="w-full text-left px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 flex items-center justify-between cursor-pointer transition-colors"
                            >
                              <span className="flex items-center gap-2">
                                <span>{ide.icon}</span>
                                <span>{ide.name}</span>
                              </span>
                              {ide.id === defaultIde ? (
                                <span className="text-[10px] font-mono text-[#8CA9CF] font-semibold">
                                  Default
                                </span>
                              ) : (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSetDefaultIde(ide.id);
                                  }}
                                  className="text-[9px] text-zinc-500 hover:text-zinc-200 px-1 py-0.5 rounded hover:bg-zinc-700 transition"
                                  title={`Set ${ide.name} as default`}
                                >
                                  Make Default
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                        <div className="border-t border-zinc-800 pt-1 px-2.5 pb-1">
                          <div className="text-[10px] text-zinc-500">
                            Current Default: <strong className="text-zinc-200">{currentIdeConfig.name}</strong>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Reveal in Finder (Symbol Only) */}
                  <button
                    onClick={() => handleRevealInFinder(project.path)}
                    disabled={runningAction !== null}
                    className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-300 bg-zinc-800/80 border border-zinc-700 hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50 transition-all flex items-center justify-center cursor-pointer shadow-xs"
                    title="Reveal directory in Finder"
                  >
                    {runningAction?.path === project.path &&
                    runningAction.action === "finder" ? (
                      <span className="w-3.5 h-3.5 rounded-full border border-zinc-400 border-t-white animate-spin" />
                    ) : (
                      <svg className="w-3.5 h-3.5 text-zinc-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    )}
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
