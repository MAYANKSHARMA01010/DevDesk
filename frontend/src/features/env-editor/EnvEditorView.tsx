"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { fetchWorkspaces } from "@/services/projects";
import { WorkspaceWithProjects } from "@/types/project";
import { useWorkspaceSubscription } from "@/services/workspaceSync";
import { EnvEditorTab } from "@/types/env-editor";
import { EnvEditorPane } from "./EnvEditorPane";

const LOCAL_STORAGE_TABS_KEY = "devdesk_env_tabs_v2";
const LOCAL_STORAGE_ACTIVE_TAB_KEY = "devdesk_env_active_tab_id_v2";
const LOCAL_STORAGE_SPLIT_KEY = "devdesk_env_split_mode_v2";

interface EnvEditorViewProps {
  isActive?: boolean;
  initialSelection?: {
    workspaceId?: string;
    projectId?: string;
  } | null;
}

function createDefaultEnvTab(index: number = 1): EnvEditorTab {
  return {
    id: `env-tab-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    title: `Env Session ${index}`,
    workspaceId: "",
    projectId: "",
    selectedFilename: ".env",
    isDirty: false,
  };
}

export function EnvEditorView({
  isActive,
  initialSelection,
}: EnvEditorViewProps = {}) {
  // Workspaces state
  const [workspaces, setWorkspaces] = useState<WorkspaceWithProjects[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState<boolean>(true);

  useWorkspaceSubscription(setWorkspaces, isActive);

  // Tabs state
  const [tabs, setTabs] = useState<EnvEditorTab[]>([createDefaultEnvTab(1)]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  const [splitTabId, setSplitTabId] = useState<string | null>(null);
  const [isSplitView, setIsSplitView] = useState<boolean>(false);

  // Inline rename state
  const [editingTabTitleId, setEditingTabTitleId] = useState<string | null>(null);
  const [editingTitleText, setEditingTitleText] = useState<string>("");

  const isMountedRef = useRef<boolean>(true);

  // 1. Initialize workspaces, restore tabs from localStorage, handle initialSelection
  useEffect(() => {
    isMountedRef.current = true;

    async function initialize() {
      try {
        setLoadingWorkspaces(true);
        const loaded = await fetchWorkspaces();
        if (!isMountedRef.current) return;
        setWorkspaces(loaded);

        // Restore tabs from localStorage
        let restoredTabs: EnvEditorTab[] = [];
        try {
          const stored = localStorage.getItem(LOCAL_STORAGE_TABS_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              restoredTabs = parsed.map((t) => ({
                ...t,
                isDirty: false, // reset dirty on reload
              }));
            }
          }
        } catch {
          // ignore corrupted storage
        }

        // Restore split view preference
        try {
          const storedSplit = localStorage.getItem(LOCAL_STORAGE_SPLIT_KEY);
          if (storedSplit === "true") {
            setIsSplitView(true);
          }
        } catch {
          // ignore
        }

        let initialActiveId = "";
        try {
          initialActiveId =
            localStorage.getItem(LOCAL_STORAGE_ACTIVE_TAB_KEY) || "";
        } catch {
          // ignore
        }

        // If an initialSelection was provided from outside (e.g. ProjectsView)
        if (initialSelection?.workspaceId && initialSelection?.projectId) {
          const targetWs = loaded.find(
            (w) => w.id === initialSelection.workspaceId
          );
          const targetProj = targetWs?.projects.find(
            (p) => p.id === initialSelection.projectId
          );

          if (targetWs && targetProj) {
            const projLabel = targetProj.displayName || targetProj.name;
            const existingTab = restoredTabs.find(
              (t) => t.projectId === targetProj.id
            );

            if (existingTab) {
              initialActiveId = existingTab.id;
            } else {
              const newTab: EnvEditorTab = {
                id: `env-tab-${Date.now()}-init`,
                title: `${projLabel} › .env`,
                workspaceId: targetWs.id,
                projectId: targetProj.id,
                projectName: targetProj.name,
                selectedFilename: ".env",
                isDirty: false,
              };
              restoredTabs.push(newTab);
              initialActiveId = newTab.id;
            }
          }
        }

        // Fallback if no tabs were restored
        if (restoredTabs.length === 0) {
          const firstWs = loaded[0];
          const firstProj = firstWs?.projects[0];
          const firstTab: EnvEditorTab = {
            id: `env-tab-1`,
            title: firstProj
              ? `${firstProj.displayName || firstProj.name} › .env`
              : "Env Session 1",
            workspaceId: firstWs?.id || "",
            projectId: firstProj?.id || "",
            projectName: firstProj?.name || "",
            selectedFilename: ".env",
            isDirty: false,
          };
          restoredTabs = [firstTab];
          initialActiveId = firstTab.id;
        }

        // Set restored tabs
        setTabs(restoredTabs);

        const matchedActive = restoredTabs.find(
          (t) => t.id === initialActiveId
        );
        const resolvedActiveId = matchedActive
          ? matchedActive.id
          : restoredTabs[0].id;
        setActiveTabId(resolvedActiveId);

        // Set default split tab if more than one tab exists
        if (restoredTabs.length > 1) {
          const otherTab = restoredTabs.find((t) => t.id !== resolvedActiveId);
          setSplitTabId(otherTab ? otherTab.id : null);
        }
      } catch (err) {
        console.error("Failed to initialize environment tabs:", err);
      } finally {
        if (isMountedRef.current) {
          setLoadingWorkspaces(false);
        }
      }
    }

    initialize();

    return () => {
      isMountedRef.current = false;
    };
  }, [initialSelection]);

  // Persist tabs & active tab to localStorage
  useEffect(() => {
    if (tabs.length === 0 || typeof window === "undefined") return;
    try {
      const serialized = tabs.map((t) => ({
        id: t.id,
        title: t.title,
        workspaceId: t.workspaceId,
        projectId: t.projectId,
        projectName: t.projectName,
        selectedFilename: t.selectedFilename,
      }));
      localStorage.setItem(LOCAL_STORAGE_TABS_KEY, JSON.stringify(serialized));
    } catch {
      // ignore storage quota errors
    }
  }, [tabs]);

  useEffect(() => {
    if (activeTabId && typeof window !== "undefined") {
      try {
        localStorage.setItem(LOCAL_STORAGE_ACTIVE_TAB_KEY, activeTabId);
      } catch {
        // ignore
      }
    }
  }, [activeTabId]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(LOCAL_STORAGE_SPLIT_KEY, String(isSplitView));
      } catch {
        // ignore
      }
    }
  }, [isSplitView]);

  // Tab Add
  const handleAddTab = useCallback(() => {
    setTabs((prev) => {
      const newIndex = prev.length + 1;
      // Copy workspace and project from current active tab if available
      const currentActive = prev.find((t) => t.id === activeTabId) || prev[0];
      const newTab: EnvEditorTab = {
        id: `env-tab-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: currentActive
          ? `${currentActive.projectName || "Env"} (${newIndex})`
          : `Env Session ${newIndex}`,
        workspaceId: currentActive?.workspaceId || workspaces[0]?.id || "",
        projectId:
          currentActive?.projectId ||
          workspaces[0]?.projects[0]?.id ||
          "",
        projectName: currentActive?.projectName || "",
        selectedFilename: ".env",
        isDirty: false,
      };

      const updated = [...prev, newTab];
      setActiveTabId(newTab.id);

      if (isSplitView && !splitTabId) {
        setSplitTabId(newTab.id);
      }

      return updated;
    });
  }, [activeTabId, workspaces, isSplitView, splitTabId]);

  // Tab Close
  const handleCloseTab = useCallback(
    (tabIdToClose: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();

      const targetTab = tabs.find((t) => t.id === tabIdToClose);
      if (targetTab?.isDirty) {
        const confirmClose = window.confirm(
          `Tab "${targetTab.title}" has unsaved changes. Are you sure you want to close it?`
        );
        if (!confirmClose) return;
      }

      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== tabIdToClose);

        if (remaining.length === 0) {
          const freshTab = createDefaultEnvTab(1);
          setActiveTabId(freshTab.id);
          setSplitTabId(null);
          return [freshTab];
        }

        if (activeTabId === tabIdToClose) {
          setActiveTabId(remaining[remaining.length - 1].id);
        }

        if (splitTabId === tabIdToClose) {
          const otherTab = remaining.find((t) => t.id !== activeTabId);
          setSplitTabId(otherTab ? otherTab.id : null);
        }

        return remaining;
      });
    },
    [tabs, activeTabId, splitTabId]
  );

  // Tab Rename
  const handleStartRename = (tab: EnvEditorTab, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabTitleId(tab.id);
    setEditingTitleText(tab.title);
  };

  const handleSaveRename = () => {
    if (!editingTabTitleId) return;
    const trimmed = editingTitleText.trim();
    if (trimmed.length > 0) {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === editingTabTitleId ? { ...t, title: trimmed } : t
        )
      );
    }
    setEditingTabTitleId(null);
  };

  // Toggle Split View
  const handleToggleSplitView = () => {
    setIsSplitView((prev) => {
      const next = !prev;
      if (next) {
        // If enabling split view and only 1 tab exists, automatically add a 2nd tab
        if (tabs.length === 1) {
          const currentTab = tabs[0];
          const newTab: EnvEditorTab = {
            id: `env-tab-${Date.now()}-split`,
            title: `${currentTab.title} (Split)`,
            workspaceId: currentTab.workspaceId,
            projectId: currentTab.projectId,
            projectName: currentTab.projectName,
            selectedFilename: ".env.local",
            isDirty: false,
          };
          setTabs([currentTab, newTab]);
          setSplitTabId(newTab.id);
        } else if (!splitTabId || splitTabId === activeTabId) {
          const other = tabs.find((t) => t.id !== activeTabId);
          setSplitTabId(other ? other.id : tabs[0].id);
        }
      }
      return next;
    });
  };

  // Tab Meta & Dirty State Callbacks
  const handleTabDirtyChange = useCallback(
    (tabId: string, isDirty: boolean) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, isDirty } : t))
      );
    },
    []
  );

  const handleTabMetaChange = useCallback(
    (
      tabId: string,
      meta: {
        title: string;
        workspaceId: string;
        projectId: string;
        projectName: string;
        filename: string;
      }
    ) => {
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== tabId) return t;
          // Don't overwrite if user gave a custom title unless it was default
          const isDefaultTitle =
            t.title.startsWith("Env Session") ||
            t.title.includes(" › ") ||
            t.title.includes("(Split)");
          return {
            ...t,
            title: isDefaultTitle ? meta.title : t.title,
            workspaceId: meta.workspaceId,
            projectId: meta.projectId,
            projectName: meta.projectName,
            selectedFilename: meta.filename,
          };
        })
      );
    },
    []
  );

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0] || null;
  const secondaryTab =
    tabs.find((t) => t.id === splitTabId) ||
    tabs.find((t) => t.id !== activeTabId) ||
    null;

  return (
    <div className="flex flex-col h-full p-4 sm:p-6 text-[#E8EBF1] w-full overflow-hidden">
      {/* 1. Header & Title with Multi-Env Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-[#E8EBF1]">
              Environment Variables
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-[#272D38] text-[#8CA9CF] border border-[#303642]">
              AES-Safe Local Storage
            </span>
          </div>
          <p className="text-xs text-[#A5ADBA] mt-0.5">
            Multi-environment manager: inspect, validate, compare, and edit variables across projects and stages.
          </p>
        </div>

        {/* Global Tab Controls */}
        <div className="flex items-center gap-2">
          {/* Split View Toggle */}
          <button
            onClick={handleToggleSplitView}
            className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition flex items-center gap-1.5 cursor-pointer shadow-xs ${
              isSplitView
                ? "bg-[#35465E] text-[#8CA9CF] border border-[#8CA9CF]/40 shadow-xs"
                : "text-[#E8EBF1] bg-[#272D38] hover:bg-[#303642] border-[#303642]"
            }`}
            title={
              isSplitView
                ? "Switch to single view"
                : "View 2 environment sessions side-by-side"
            }
          >
            <span>{isSplitView ? "▢ Single View" : "◫ Split View"}</span>
          </button>

          {/* New Tab Button */}
          <button
            onClick={handleAddTab}
            className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-[#101216] bg-[#8CA9CF] hover:bg-[#A6BDE0] border border-transparent transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Open a new environment session tab"
          >
            <span className="text-sm font-bold leading-none">+</span>
            <span>New Env Tab</span>
          </button>
        </div>
      </div>

      {/* 2. Multi-Env Tab Bar (Consistent with TerminalView) */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-2 border-b border-[#303642] shrink-0">
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          const isSplitActive = isSplitView && tab.id === splitTabId;

          return (
            <div
              key={tab.id}
              onClick={() => {
                setActiveTabId(tab.id);
              }}
              className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-md border-t border-x text-xs cursor-pointer select-none transition-all ${
                isActive
                  ? "bg-[#1D2129] border-t-2 border-t-[#8CA9CF] border-x-[#303642] border-b-0 text-[#E8EBF1] font-medium shadow-xs"
                  : isSplitActive
                  ? "bg-[#1D2129] border-t border-x-[#303642] text-[#8CA9CF] font-medium"
                  : "bg-[#171A20] border-transparent text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38]"
              }`}
              title={`Click to switch. Double-click to rename.\n${
                tab.isDirty ? "Status: Unsaved changes" : "Status: Clean"
              }`}
            >
              {/* Status indicator dot */}
              <span className="flex h-2 w-2 shrink-0 items-center justify-center">
                <span
                  className={`inline-flex rounded-full h-1.5 w-1.5 ${
                    tab.isDirty ? "bg-[#E0B36D]" : "bg-[#77B58A]"
                  }`}
                />
              </span>

              {/* Title or inline rename input */}
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
                  className="px-1 py-0.5 rounded bg-[#272D38] text-[#E8EBF1] border border-[#303642] text-xs w-32 focus:outline-none focus:border-[#8CA9CF]"
                />
              ) : (
                <span
                  onDoubleClick={(e) => handleStartRename(tab, e)}
                  title={tab.title || `Env ${idx + 1}`}
                  className="truncate max-w-[220px] font-mono text-[11px]"
                >
                  {tab.title || `Env ${idx + 1}`}
                </span>
              )}

              {/* Split Indicator Tag if in split view */}
              {isSplitView && (
                <span className="text-[9px] px-1 py-0.2 rounded font-sans uppercase tracking-tight text-[#7C8594]">
                  {tab.id === activeTabId
                    ? "Left"
                    : tab.id === splitTabId
                    ? "Right"
                    : ""}
                </span>
              )}

              {/* Close Tab Button */}
              {tabs.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className="opacity-0 group-hover:opacity-100 hover:bg-[#303642] p-0.5 rounded text-[#7C8594] hover:text-[#E8EBF1] transition-opacity ml-1 cursor-pointer"
                  title="Close environment session"
                >
                  <span className="text-xs leading-none">✕</span>
                </button>
              )}
            </div>
          );
        })}

        {/* Quick Add Tab Button */}
        <button
          onClick={handleAddTab}
          className="px-2 py-1.5 rounded-t-lg text-[#7C8594] hover:text-[#E8EBF1] hover:bg-[#272D38] transition text-xs font-bold cursor-pointer"
          title="Open new environment session"
        >
          +
        </button>
      </div>

      {/* 3. Session Panes Container: Single View or Side-by-Side Split View */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {isSplitView ? (
          /* Split View: Dual Pane Side-by-Side */
          <div className="flex-1 flex flex-col md:flex-row h-full min-h-0 gap-3 overflow-hidden">
            {/* Left Pane (Primary Active Tab) */}
            <div className="flex-1 flex flex-col h-full min-h-0 border border-[#303642] rounded-lg overflow-hidden bg-[#1D2129]">
              <div className="px-3 py-1.5 bg-[#171A20] border-b border-[#303642] flex items-center justify-between text-xs font-mono text-[#E8EBF1] shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#8CA9CF]">Left Pane:</span>
                  <span className="text-[#E8EBF1] font-medium">
                    {activeTab?.title || "Active Session"}
                  </span>
                </div>
                {activeTab?.isDirty && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#E0B36D]/15 text-[#E0B36D] border border-[#E0B36D]/30 font-sans">
                    Unsaved Changes
                  </span>
                )}
              </div>
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {activeTab && (
                  <EnvEditorPane
                    key={activeTab.id}
                    tabId={activeTab.id}
                    tabTitle={activeTab.title}
                    initialWorkspaceId={activeTab.workspaceId}
                    initialProjectId={activeTab.projectId}
                    initialFilename={activeTab.selectedFilename}
                    workspaces={workspaces}
                    loadingWorkspaces={loadingWorkspaces}
                    isActivePane={true}
                    isSplit={true}
                    onDirtyChange={handleTabDirtyChange}
                    onMetaChange={handleTabMetaChange}
                  />
                )}
              </div>
            </div>

            {/* Right Pane (Secondary Split Tab) */}
            <div className="flex-1 flex flex-col h-full min-h-0 border border-[#303642] rounded-lg overflow-hidden bg-[#1D2129]">
              <div className="px-3 py-1.5 bg-[#171A20] border-b border-[#303642] flex items-center justify-between text-xs font-mono text-[#E8EBF1] shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#8CA9CF]">
                    Right Pane:
                  </span>
                  <select
                    value={secondaryTab?.id || ""}
                    onChange={(e) => setSplitTabId(e.target.value)}
                    className="px-2 py-0.5 bg-[#272D38] border border-[#303642] rounded text-xs text-[#E8EBF1] focus:outline-none focus:border-[#8CA9CF] font-mono"
                  >
                    {tabs.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} {t.isDirty ? "•" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                {secondaryTab?.isDirty && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#E0B36D]/15 text-[#E0B36D] border border-[#E0B36D]/30 font-sans">
                    Unsaved Changes
                  </span>
                )}
              </div>
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {secondaryTab ? (
                  <EnvEditorPane
                    key={secondaryTab.id}
                    tabId={secondaryTab.id}
                    tabTitle={secondaryTab.title}
                    initialWorkspaceId={secondaryTab.workspaceId}
                    initialProjectId={secondaryTab.projectId}
                    initialFilename={secondaryTab.selectedFilename}
                    workspaces={workspaces}
                    loadingWorkspaces={loadingWorkspaces}
                    isActivePane={false}
                    isSplit={true}
                    onDirtyChange={handleTabDirtyChange}
                    onMetaChange={handleTabMetaChange}
                  />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[#7C8594] text-xs">
                    <p>No secondary tab selected.</p>
                    <button
                      onClick={handleAddTab}
                      className="mt-3 px-3 py-1 bg-[#272D38] hover:bg-[#303642] text-[#E8EBF1] border border-[#303642] rounded text-xs transition cursor-pointer"
                    >
                      + Open New Session Tab
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Single View: Tabs remain mounted in DOM to preserve unsaved changes & state */
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {tabs.map((tab) => {
              const isTabActive = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  className={
                    isTabActive
                      ? "flex-1 flex flex-col h-full min-h-0"
                      : "hidden"
                  }
                >
                  <EnvEditorPane
                    tabId={tab.id}
                    tabTitle={tab.title}
                    initialWorkspaceId={tab.workspaceId}
                    initialProjectId={tab.projectId}
                    initialFilename={tab.selectedFilename}
                    workspaces={workspaces}
                    loadingWorkspaces={loadingWorkspaces}
                    isActivePane={isTabActive}
                    isSplit={false}
                    onDirtyChange={handleTabDirtyChange}
                    onMetaChange={handleTabMetaChange}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
