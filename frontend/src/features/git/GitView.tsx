"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWorkspaces } from "@/services/projects";
import {
  checkoutBranch,
  commitGitChanges,
  fetchGitBranches,
  fetchGitDiff,
  fetchGitHistory,
  fetchGitStatus,
  stageGitFiles,
  unstageGitFiles,
} from "@/services/git";
import { WorkspaceWithProjects } from "@/types/project";
import {
  GitBranchesResult,
  GitCommitItem,
  GitDiffResult,
  GitFileChange,
  GitStatusResult,
} from "@/types/git";

interface GitViewProps {
  initialSelection?: {
    workspaceId?: string;
    projectId?: string;
  } | null;
}

export function GitView({ initialSelection }: GitViewProps = {}) {
  // Workspaces and Project selection
  const [workspaces, setWorkspaces] = useState<WorkspaceWithProjects[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(
    initialSelection?.workspaceId || ""
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    initialSelection?.projectId || ""
  );

  // Git data state
  const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null);
  const [branches, setBranches] = useState<GitBranchesResult | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [history, setHistory] = useState<GitCommitItem[]>([]);

  // Selected file and diff state
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    staged: boolean;
  } | null>(null);
  const [diffResult, setDiffResult] = useState<GitDiffResult | null>(null);
  const [loadingDiff, setLoadingDiff] = useState<boolean>(false);

  // Commit message state
  const [commitMessage, setCommitMessage] = useState<string>("");

  // Loading & Action states
  const [loadingWorkspaces, setLoadingWorkspaces] = useState<boolean>(true);
  const [loadingGit, setLoadingGit] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // View tab in right panel: "diff" or "history"
  const [rightPanelTab, setRightPanelTab] = useState<"diff" | "history">("diff");

  // Checkout confirmation modal when dirty
  const [pendingCheckoutBranch, setPendingCheckoutBranch] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);

  // 1. Initial Load: Workspaces
  useEffect(() => {
    isMountedRef.current = true;

    async function loadWorkspaces() {
      try {
        setLoadingWorkspaces(true);
        const loaded = await fetchWorkspaces();
        if (!isMountedRef.current) return;
        setWorkspaces(loaded);

        if (loaded.length > 0) {
          if (initialSelection?.workspaceId) {
            const targetWs = loaded.find((w) => w.id === initialSelection.workspaceId);
            if (targetWs) {
              setSelectedWorkspaceId(targetWs.id);
              if (initialSelection?.projectId) {
                const targetProj = targetWs.projects.find((p) => p.id === initialSelection.projectId);
                if (targetProj) {
                  setSelectedProjectId(targetProj.id);
                }
              }
            }
          } else {
            // Default None
            setSelectedWorkspaceId("");
            setSelectedProjectId("");
          }
        } else {
          setSelectedWorkspaceId("");
          setSelectedProjectId("");
        }
      } catch (err: unknown) {
        if (!isMountedRef.current) return;
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to load workspaces"
        );
      } finally {
        if (isMountedRef.current) setLoadingWorkspaces(false);
      }
    }

    loadWorkspaces();

    return () => {
      isMountedRef.current = false;
    };
  }, [initialSelection]);

  // Derived active workspace and project
  const activeWorkspace =
    workspaces.find((w) => w.id === selectedWorkspaceId) || null;
  const activeProject =
    activeWorkspace?.projects.find((p) => p.id === selectedProjectId) || null;

  // 2. Fetch all Git data for selected project
  async function loadGitData(projectId: string, isManualRefresh = false) {
    if (!projectId) {
      setGitStatus(null);
      setBranches(null);
      setHistory([]);
      setSelectedFile(null);
      setDiffResult(null);
      return;
    }

    if (isManualRefresh) setRefreshing(true);
    else setLoadingGit(true);

    setErrorMessage(null);

    try {
      const [statusData, branchesData, historyData] = await Promise.all([
        fetchGitStatus(projectId),
        fetchGitBranches(projectId).catch(() => null),
        fetchGitHistory(projectId, 25).catch(() => ({ commits: [], total: 0 })),
      ]);

      if (!isMountedRef.current) return;

      setGitStatus(statusData);
      setBranches(branchesData);
      if (branchesData?.currentBranch) {
        setSelectedBranch(branchesData.currentBranch);
      }
      setHistory(historyData.commits);

      // Auto-select first changed file if none selected or selected file no longer exists
      if (statusData.files.length > 0) {
        setSelectedFile((prev) => {
          if (
            prev &&
            statusData.files.some(
              (f) => f.path === prev.path && f.staged === prev.staged
            )
          ) {
            return prev;
          }
          const firstStaged = statusData.stagedFiles[0];
          if (firstStaged) return { path: firstStaged.path, staged: true };
          const firstUnstaged = statusData.unstagedFiles[0] || statusData.untrackedFiles[0];
          if (firstUnstaged) return { path: firstUnstaged.path, staged: false };
          return null;
        });
      } else {
        setSelectedFile(null);
        setDiffResult(null);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setGitStatus(null);
      setBranches(null);
      setHistory([]);
      setSelectedFile(null);
      setDiffResult(null);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to load Git repository data"
      );
    } finally {
      if (isMountedRef.current) {
        setLoadingGit(false);
        setRefreshing(false);
      }
    }
  }

  // Reload Git data when selected project changes
  useEffect(() => {
    if (selectedProjectId) {
      loadGitData(selectedProjectId);
    } else {
      setGitStatus(null);
      setBranches(null);
      setHistory([]);
      setSelectedFile(null);
      setDiffResult(null);
      setErrorMessage(null);
    }
  }, [selectedProjectId]);

  // 3. Load diff when selectedFile changes
  useEffect(() => {
    if (!selectedProjectId || !selectedFile) {
      setDiffResult(null);
      return;
    }

    let mounted = true;

    async function loadDiff() {
      try {
        setLoadingDiff(true);
        const result = await fetchGitDiff(
          selectedProjectId,
          selectedFile!.path,
          selectedFile!.staged
        );
        if (!mounted) return;
        setDiffResult(result);
      } catch (err: unknown) {
        if (!mounted) return;
        setDiffResult(null);
      } finally {
        if (mounted) setLoadingDiff(false);
      }
    }

    loadDiff();

    return () => {
      mounted = false;
    };
  }, [selectedProjectId, selectedFile]);

  // 4. Staging / Unstaging Actions
  async function handleStage(file: string) {
    if (!selectedProjectId) return;
    try {
      setActionLoading(true);
      setErrorMessage(null);
      await stageGitFiles(selectedProjectId, [file]);
      // Update selected file state to staged
      setSelectedFile({ path: file, staged: true });
      await loadGitData(selectedProjectId);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : `Failed to stage ${file}`
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStageAll() {
    if (!selectedProjectId) return;
    try {
      setActionLoading(true);
      setErrorMessage(null);
      await stageGitFiles(selectedProjectId, undefined, true);
      await loadGitData(selectedProjectId);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to stage all changes"
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnstage(file: string) {
    if (!selectedProjectId) return;
    try {
      setActionLoading(true);
      setErrorMessage(null);
      await unstageGitFiles(selectedProjectId, [file]);
      // Update selected file state to unstaged
      setSelectedFile({ path: file, staged: false });
      await loadGitData(selectedProjectId);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : `Failed to unstage ${file}`
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnstageAll() {
    if (!selectedProjectId) return;
    try {
      setActionLoading(true);
      setErrorMessage(null);
      await unstageGitFiles(selectedProjectId, undefined, true);
      await loadGitData(selectedProjectId);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to unstage all changes"
      );
    } finally {
      setActionLoading(false);
    }
  }

  // 5. Commit Action
  async function handleCommit() {
    if (!selectedProjectId || !commitMessage.trim()) return;
    try {
      setActionLoading(true);
      setErrorMessage(null);
      const result = await commitGitChanges(selectedProjectId, commitMessage);
      setCommitMessage("");
      setSuccessMessage(`Committed ${result.commitHash.substring(0, 7)}: "${result.message}"`);
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadGitData(selectedProjectId);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to create commit"
      );
    } finally {
      setActionLoading(false);
    }
  }

  // 6. Branch Switch Action
  async function performCheckout(branchName: string) {
    if (!selectedProjectId || !branchName) return;
    try {
      setActionLoading(true);
      setErrorMessage(null);
      const res = await checkoutBranch(selectedProjectId, branchName);
      setSuccessMessage(res.message);
      setTimeout(() => setSuccessMessage(null), 4000);
      setPendingCheckoutBranch(null);
      await loadGitData(selectedProjectId);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : `Failed to switch to branch "${branchName}"`
      );
    } finally {
      setActionLoading(false);
    }
  }

  function handleBranchSelect(targetBranch: string) {
    if (!targetBranch || targetBranch === branches?.currentBranch) return;

    // If working tree is modified, confirm before switching
    if (gitStatus && !gitStatus.isClean) {
      setPendingCheckoutBranch(targetBranch);
    } else {
      performCheckout(targetBranch);
    }
  }

  // Helper formatting methods
  function getWorkspaceLabel(rootPath: string): string {
    const parts = rootPath.split(/[/\\]/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : rootPath;
  }

  function formatRelativeDate(isoDate: string): string {
    try {
      const d = new Date(isoDate);
      const diffSecs = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
      if (diffSecs < 60) return "just now";
      const mins = Math.floor(diffSecs / 60);
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days < 30) return `${days}d ago`;
      return d.toLocaleDateString();
    } catch {
      return isoDate;
    }
  }

  function renderStatusBadge(status: string) {
    switch (status) {
      case "modified":
        return (
          <span className="w-4 h-4 rounded text-[10px] font-mono font-bold flex items-center justify-center bg-amber-950/70 text-amber-300 border border-amber-800/60 shrink-0">
            M
          </span>
        );
      case "added":
        return (
          <span className="w-4 h-4 rounded text-[10px] font-mono font-bold flex items-center justify-center bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 shrink-0">
            A
          </span>
        );
      case "deleted":
        return (
          <span className="w-4 h-4 rounded text-[10px] font-mono font-bold flex items-center justify-center bg-rose-950/70 text-rose-300 border border-rose-800/60 shrink-0">
            D
          </span>
        );
      case "renamed":
        return (
          <span className="w-4 h-4 rounded text-[10px] font-mono font-bold flex items-center justify-center bg-cyan-950/70 text-cyan-300 border border-cyan-800/60 shrink-0">
            R
          </span>
        );
      case "untracked":
        return (
          <span className="w-4 h-4 rounded text-[10px] font-mono font-bold flex items-center justify-center bg-zinc-800 text-zinc-400 border border-zinc-700 shrink-0">
            ?
          </span>
        );
      default:
        return (
          <span className="w-4 h-4 rounded text-[10px] font-mono font-bold flex items-center justify-center bg-zinc-800 text-zinc-400 border border-zinc-700 shrink-0">
            •
          </span>
        );
    }
  }

  // --- RENDER STATES ---

  // Loading initial workspaces
  if (loadingWorkspaces) {
    return (
      <div className="flex flex-col h-full p-6 text-zinc-100 w-full">
        <div className="mb-6">
          <h2 className="text-xl font-semibold tracking-tight">Git Control</h2>
          <p className="text-xs text-zinc-400 mt-1">Connecting to workspace repositories...</p>
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
          <h2 className="text-xl font-semibold tracking-tight">Git Control</h2>
          <p className="text-xs text-zinc-400 mt-1">
            Manage repository status, branches, diffs, and commits.
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-10 bg-zinc-900/30 text-center">
          <div className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-mono text-zinc-400 mb-4 shadow-sm">
            ⎇
          </div>
          <p className="text-sm font-semibold text-zinc-200">No Workspaces Found</p>
          <p className="text-xs text-zinc-400 mt-1 max-w-md leading-relaxed">
            Scan and save a workspace root in the Projects tab before inspecting Git repositories.
          </p>
        </div>
      </div>
    );
  }

  const stagedCount = gitStatus?.stagedFiles.length || 0;
  const unstagedCount = (gitStatus?.unstagedFiles.length || 0) + (gitStatus?.untrackedFiles.length || 0);

  return (
    <div className="flex flex-col h-full p-6 text-zinc-100 w-full">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Git Control</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Working tree inspection, staging, file diffs, branches, and commit creation.
            </p>
          </div>

          {/* Refresh & Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => selectedProjectId && loadGitData(selectedProjectId, true)}
              disabled={refreshing || actionLoading || !selectedProjectId}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Refresh repository status and branches"
            >
              <span className={refreshing ? "animate-spin" : ""}>🔄</span>
              <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* Workspace, Project, and Branch Selectors Bar */}
        <div className="p-3 rounded-lg bg-zinc-900/70 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {/* Workspace Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-500 uppercase font-medium">Workspace:</span>
              <select
                value={selectedWorkspaceId}
                onChange={(e) => {
                  setSelectedWorkspaceId(e.target.value);
                  setSelectedProjectId("");
                }}
                disabled={actionLoading}
                className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-200 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all cursor-pointer max-w-[160px] truncate"
              >
                <option value="">None (Select Workspace)</option>
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
                className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-200 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all cursor-pointer max-w-[180px] truncate"
              >
                <option value="">None (Select Project)</option>
                {activeWorkspace?.projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.isRoot ? `[Root] ${proj.name}` : proj.isGitRepo ? `[Git] ${proj.name}` : proj.name}
                    {proj.relativePath && proj.relativePath !== "." ? ` (${proj.relativePath})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Branch Selector & Switch */}
            {branches && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-800">
                <span className="text-[11px] text-zinc-500 uppercase font-medium">Branch:</span>
                <select
                  value={selectedBranch}
                  onChange={(e) => {
                    setSelectedBranch(e.target.value);
                    handleBranchSelect(e.target.value);
                  }}
                  disabled={actionLoading || branches.localBranches.length === 0}
                  className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-200 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all cursor-pointer max-w-[180px] truncate"
                >
                  {branches.localBranches.map((b) => (
                    <option key={b} value={b}>
                      {b} {b === branches.currentBranch ? "✓" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Repository & Working Tree Status Badges */}
          {gitStatus && (
            <div className="flex items-center gap-2">
              {gitStatus.currentBranch ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium bg-zinc-950 text-cyan-400 border border-cyan-900/60 shadow-sm">
                  <span>⎇</span>
                  <span>{gitStatus.currentBranch}</span>
                  {gitStatus.ahead > 0 && <span className="text-emerald-400">↑{gitStatus.ahead}</span>}
                  {gitStatus.behind > 0 && <span className="text-rose-400">↓{gitStatus.behind}</span>}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[11px] font-mono text-zinc-500 bg-zinc-950 border border-zinc-800">
                  (unborn branch)
                </span>
              )}

              {gitStatus.isClean ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-emerald-950/70 text-emerald-300 border border-emerald-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Clean</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-amber-950/70 text-amber-300 border border-amber-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span>{gitStatus.files.length} changed</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Notifications & Confirmation Banners */}
        {errorMessage && (
          <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-900/60 text-rose-300 text-xs flex items-center justify-between gap-3 animate-in fade-in">
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
          <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-900/60 text-emerald-300 text-xs flex items-center justify-between gap-3 animate-in fade-in">
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

        {/* Branch Checkout Confirmation Modal/Banner */}
        {pendingCheckoutBranch && (
          <div className="p-3.5 rounded-lg bg-amber-950/60 border border-amber-800/70 text-amber-200 text-xs flex flex-wrap items-center justify-between gap-3 shadow-md animate-in fade-in">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>
                You have uncommitted changes in your working tree. Switching to{" "}
                <span className="font-mono font-semibold text-white">
                  {pendingCheckoutBranch}
                </span>{" "}
                might conflict with local changes. Do you want to proceed?
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => performCheckout(pendingCheckoutBranch)}
                disabled={actionLoading}
                className="px-3 py-1 rounded bg-amber-600 text-white font-medium hover:bg-amber-500 transition-colors cursor-pointer shadow-sm"
              >
                Yes, Switch
              </button>
              <button
                onClick={() => {
                  setPendingCheckoutBranch(null);
                  if (branches?.currentBranch) setSelectedBranch(branches.currentBranch);
                }}
                className="px-2.5 py-1 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Main Work Area */}
      {loadingGit ? (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-12 bg-zinc-900/20 text-center">
          <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-zinc-200 animate-spin mb-4" />
          <p className="text-sm font-medium text-zinc-300">Inspecting Git repository...</p>
        </div>
      ) : !selectedProjectId ? (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-12 bg-zinc-900/30 text-center">
          <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm font-mono text-zinc-400 mb-4 shadow-sm">
            ⎇
          </div>
          <p className="text-sm font-semibold text-zinc-200">No Project Selected</p>
          <p className="text-xs text-zinc-400 mt-1 max-w-md leading-relaxed">
            Select a workspace and project from the toolbar above to view Git branches, inspect file changes, stage files, and create commits.
          </p>
        </div>
      ) : !gitStatus ? (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-12 bg-zinc-900/30 text-center">
          <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm font-mono text-zinc-400 mb-4 shadow-sm">
            ⎇
          </div>
          <p className="text-sm font-semibold text-zinc-200">No Git Repository Accessible</p>
          <p className="text-xs text-zinc-400 mt-1 max-w-md leading-relaxed">
            The selected project does not appear to be inside a valid Git repository, or Git is not
            available. Select a project within a Git workspace to view status and changes.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4">
          {/* LEFT PANEL: Commit Box & File Changes List (Width ~380px) */}
          <div className="w-full lg:w-[380px] shrink-0 flex flex-col gap-3 min-h-0">
            {/* Commit Box */}
            <div className="p-3.5 rounded-lg bg-zinc-900/80 border border-zinc-800 flex flex-col gap-2.5 shadow-sm">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-300">Create Commit</span>
                <span className="text-[11px] text-zinc-500 font-mono">
                  {stagedCount} staged {stagedCount === 1 ? "file" : "files"}
                </span>
              </div>
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit message (e.g. 'feat: implement git staging')..."
                rows={2}
                disabled={actionLoading}
                className="w-full px-3 py-2 text-xs rounded-md bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600 resize-none transition-all"
              />
              <button
                onClick={handleCommit}
                disabled={actionLoading || !commitMessage.trim() || stagedCount === 0}
                className="w-full py-1.5 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <span>Commit</span>
                <span>({stagedCount} staged)</span>
              </button>
            </div>

            {/* Changes Accordion / List */}
            <div className="flex-1 min-h-0 rounded-lg bg-zinc-900/60 border border-zinc-800 flex flex-col overflow-hidden shadow-sm">
              {/* STAGED SECTION */}
              <div className="p-2.5 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between text-xs select-none">
                <div className="flex items-center gap-1.5 font-medium text-zinc-300">
                  <span className="text-emerald-400">●</span>
                  <span>Staged Changes</span>
                  <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-[11px] font-mono text-zinc-400">
                    {stagedCount}
                  </span>
                </div>
                {stagedCount > 0 && (
                  <button
                    onClick={handleUnstageAll}
                    disabled={actionLoading}
                    className="text-[11px] text-zinc-400 hover:text-zinc-200 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Unstage All
                  </button>
                )}
              </div>

              <div className="max-h-[42%] overflow-y-auto divide-y divide-zinc-800/40 text-xs">
                {stagedCount === 0 ? (
                  <div className="py-3 px-4 text-center text-zinc-500 text-[11px]">
                    No staged changes
                  </div>
                ) : (
                  gitStatus.stagedFiles.map((file) => {
                    const isSelected =
                      selectedFile?.path === file.path && selectedFile?.staged === true;
                    return (
                      <div
                        key={`staged-${file.path}`}
                        onClick={() => setSelectedFile({ path: file.path, staged: true })}
                        className={`py-2 px-3 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-zinc-800/90 text-white font-medium"
                            : "hover:bg-zinc-800/50 text-zinc-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate min-w-0">
                          {renderStatusBadge(file.indexStatus)}
                          <span className="font-mono text-[11px] truncate" title={file.path}>
                            {file.path}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnstage(file.path);
                          }}
                          disabled={actionLoading}
                          className="px-1.5 py-0.5 rounded text-[11px] font-bold text-zinc-400 hover:text-rose-300 hover:bg-zinc-700/60 cursor-pointer transition-colors"
                          title="Unstage this file"
                        >
                          −
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* UNSTAGED / UNTRACKED SECTION */}
              <div className="p-2.5 bg-zinc-900/90 border-y border-zinc-800 flex items-center justify-between text-xs select-none">
                <div className="flex items-center gap-1.5 font-medium text-zinc-300">
                  <span className="text-amber-400">●</span>
                  <span>Changes</span>
                  <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-[11px] font-mono text-zinc-400">
                    {unstagedCount}
                  </span>
                </div>
                {unstagedCount > 0 && (
                  <button
                    onClick={handleStageAll}
                    disabled={actionLoading}
                    className="text-[11px] text-zinc-400 hover:text-zinc-200 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Stage All
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40 text-xs">
                {unstagedCount === 0 ? (
                  <div className="py-4 px-4 text-center text-zinc-500 text-[11px]">
                    Working tree is clean
                  </div>
                ) : (
                  [...gitStatus.unstagedFiles, ...gitStatus.untrackedFiles].map((file) => {
                    const isSelected =
                      selectedFile?.path === file.path && selectedFile?.staged === false;
                    return (
                      <div
                        key={`unstaged-${file.path}`}
                        onClick={() => setSelectedFile({ path: file.path, staged: false })}
                        className={`py-2 px-3 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-zinc-800/90 text-white font-medium"
                            : "hover:bg-zinc-800/50 text-zinc-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate min-w-0">
                          {renderStatusBadge(file.workingTreeStatus)}
                          <span className="font-mono text-[11px] truncate" title={file.path}>
                            {file.path}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStage(file.path);
                          }}
                          disabled={actionLoading}
                          className="px-1.5 py-0.5 rounded text-[11px] font-bold text-zinc-400 hover:text-emerald-300 hover:bg-zinc-700/60 cursor-pointer transition-colors"
                          title="Stage this file"
                        >
                          +
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Diff Viewer or Commit History (flex-1) */}
          <div className="flex-1 min-h-0 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col overflow-hidden shadow-xl">
            {/* Header / Tabs */}
            <div className="px-4 py-2.5 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between text-xs select-none">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRightPanelTab("diff")}
                  className={`px-3 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                    rightPanelTab === "diff"
                      ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Diff Viewer
                </button>
                <button
                  onClick={() => setRightPanelTab("history")}
                  className={`px-3 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                    rightPanelTab === "history"
                      ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Recent History ({history.length})
                </button>
              </div>

              {/* Diff Context Info */}
              {rightPanelTab === "diff" && diffResult && (
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-zinc-400 truncate max-w-[220px]">
                    {diffResult.file}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      diffResult.staged
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                        : "bg-amber-950 text-amber-400 border border-amber-800/60"
                    }`}
                  >
                    {diffResult.staged ? "STAGED" : "UNSTAGED"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-400">+{diffResult.addedLines}</span>
                    <span className="text-rose-400">-{diffResult.removedLines}</span>
                  </div>
                </div>
              )}
            </div>

            {/* TAB 1: Diff Viewer */}
            {rightPanelTab === "diff" ? (
              <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed">
                {loadingDiff ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500">
                    <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-zinc-300 animate-spin mb-2" />
                    <span>Loading diff...</span>
                  </div>
                ) : !selectedFile ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500">
                    <span className="text-xl mb-1">⎇</span>
                    <p className="text-sm font-medium text-zinc-400">No File Selected</p>
                    <p className="text-xs text-zinc-600 mt-1">
                      Click any changed file from the list on the left to inspect its diff.
                    </p>
                  </div>
                ) : diffResult?.isBinary ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500">
                    <span className="text-xl mb-1">📦</span>
                    <p className="text-sm font-medium text-zinc-300">Binary File Changed</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Binary differences cannot be rendered as text diff.
                    </p>
                  </div>
                ) : !diffResult || !diffResult.diff.trim() ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500">
                    <p className="text-sm font-medium text-zinc-400">No Differences Detected</p>
                    <p className="text-xs text-zinc-600 mt-1">
                      This file does not have any differences in the selected state.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5 select-text">
                    {diffResult.diff.split("\n").map((line, idx) => {
                      let lineClass = "text-zinc-300";
                      let bgClass = "";

                      if (line.startsWith("+") && !line.startsWith("+++")) {
                        lineClass = "text-emerald-300 font-medium";
                        bgClass = "bg-emerald-950/40";
                      } else if (line.startsWith("-") && !line.startsWith("---")) {
                        lineClass = "text-rose-300 font-medium";
                        bgClass = "bg-rose-950/40";
                      } else if (line.startsWith("@@")) {
                        lineClass = "text-cyan-400 font-semibold";
                        bgClass = "bg-cyan-950/30";
                      } else if (line.startsWith("diff --git") || line.startsWith("index ")) {
                        lineClass = "text-zinc-500";
                      }

                      return (
                        <div
                          key={idx}
                          className={`px-2 py-0.5 rounded-sm whitespace-pre-wrap ${bgClass} ${lineClass}`}
                        >
                          {line || " "}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* TAB 2: Recent History */
              <div className="flex-1 overflow-auto divide-y divide-zinc-800/60 p-2">
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 p-8">
                    <p className="text-sm font-medium text-zinc-400">No Commits Found</p>
                    <p className="text-xs text-zinc-600 mt-1">
                      This repository has no commits yet on the current branch.
                    </p>
                  </div>
                ) : (
                  history.map((commit) => (
                    <div
                      key={commit.hash}
                      className="p-3 hover:bg-zinc-900/60 transition-colors rounded-md group"
                    >
                      <div className="flex items-center justify-between gap-3 text-xs mb-1">
                        <span className="font-semibold text-zinc-200 truncate">
                          {commit.message}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-500 group-hover:text-cyan-400 transition-colors shrink-0">
                          {commit.shortHash}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                        <span className="text-zinc-400">{commit.author}</span>
                        <span>•</span>
                        <span>{formatRelativeDate(commit.date)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
