"use client";

import { useEffect, useRef, useState } from "react";
import { NavItemId } from "@/types/navigation";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { StatusBar } from "@/components/layout/StatusBar";
import { ProjectsView } from "@/features/projects/ProjectsView";
import { TerminalView } from "@/features/terminal/TerminalView";
import { ProcessesView } from "@/features/processes/ProcessesView";
import { GitView } from "@/features/git/GitView";
import { ApiTesterView } from "@/features/api-tester/ApiTesterView";
import { DatabaseView } from "@/features/database/DatabaseView";
import { EnvEditorView } from "@/features/env-editor/EnvEditorView";
import { SettingsView } from "@/features/settings/SettingsView";
import { fetchDiagnostics } from "@/services/diagnostics";

export default function Home() {
  const [activeTab, setActiveTab] = useState<NavItemId>("projects");
  const [backendConnected, setBackendConnected] = useState<boolean>(true);
  const [runningProcessesCount, setRunningProcessesCount] = useState<number>(0);
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Restore sidebar preferences from localStorage after mount
  useEffect(() => {
    try {
      const savedVisible = localStorage.getItem("devdesk_sidebar_visible");
      if (savedVisible !== null) {
        setSidebarVisible(savedVisible === "true");
      }
      const savedCollapsed = localStorage.getItem("devdesk_sidebar_collapsed");
      if (savedCollapsed !== null) {
        setSidebarCollapsed(savedCollapsed === "true");
      }
    } catch {}
  }, []);

  function handleToggleSidebar() {
    setSidebarVisible((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("devdesk_sidebar_visible", String(next));
      } catch {}
      return next;
    });
  }

  function handleToggleCollapse() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("devdesk_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  }

  function handleHideSidebar() {
    setSidebarVisible(false);
    try {
      localStorage.setItem("devdesk_sidebar_visible", "false");
    } catch {}
  }

  const [terminalSelection, setTerminalSelection] = useState<{
    workspaceId?: string;
    projectId?: string;
    script?: string;
  } | null>(null);

  const [gitSelection, setGitSelection] = useState<{
    workspaceId?: string;
    projectId?: string;
  } | null>(null);

  const isPollingRef = useRef(false);

  // Poll backend health and running process count periodically
  useEffect(() => {
    let isMounted = true;

    async function checkHealth() {
      if (isPollingRef.current) return;
      isPollingRef.current = true;
      try {
        const diag = await fetchDiagnostics();
        if (isMounted) {
          setBackendConnected(true);
          setRunningProcessesCount(diag.runningProcessesCount ?? 0);
        }
      } catch {
        if (isMounted) {
          setBackendConnected(false);
        }
      } finally {
        isPollingRef.current = false;
      }
    }

    checkHealth();
    const interval = setInterval(checkHealth, 8000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Global keyboard shortcuts (Cmd/Ctrl + 1-7, Cmd/Ctrl + ,)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.metaKey && !e.ctrlKey) return;

      // Do not trigger shortcuts when typing inside form fields or code editors
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      // Cmd/Ctrl + B to toggle sidebar
      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        handleToggleSidebar();
        return;
      }

      let targetTab: NavItemId | null = null;
      switch (e.key) {
        case "1":
          targetTab = "projects";
          break;
        case "2":
          targetTab = "terminal";
          break;
        case "3":
          targetTab = "processes";
          break;
        case "4":
          targetTab = "git";
          break;
        case "5":
          targetTab = "api-tester";
          break;
        case "6":
          targetTab = "env";
          break;
        case "7":
          targetTab = "database";
          break;
        case ",":
          targetTab = "settings";
          break;
        default:
          break;
      }

      if (targetTab) {
        e.preventDefault();
        setActiveTab(targetTab);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function handleNavigateToTerminal(selection: {
    workspaceId?: string;
    projectId?: string;
    script?: string;
  }) {
    setTerminalSelection(selection);
    setActiveTab("terminal");
  }

  function handleNavigateToGit(selection: {
    workspaceId?: string;
    projectId?: string;
  }) {
    setGitSelection(selection);
    setActiveTab("git");
  }

  function renderMainContent() {
    switch (activeTab) {
      case "projects":
        return (
          <ProjectsView
            onNavigateToTerminal={handleNavigateToTerminal}
            onNavigateToGit={handleNavigateToGit}
          />
        );
      case "terminal":
        return <TerminalView initialSelection={terminalSelection} />;
      case "processes":
        return (
          <ProcessesView
            onNavigateToTerminal={handleNavigateToTerminal}
            onNavigateToProjects={() => setActiveTab("projects")}
          />
        );
      case "git":
        return <GitView initialSelection={gitSelection} />;
      case "api-tester":
        return <ApiTesterView />;
      case "database":
        return <DatabaseView />;
      case "env":
        return <EnvEditorView />;
      case "settings":
        return <SettingsView />;
      default:
        return <ProjectsView />;
    }
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      {/* 1. Header Shell */}
      <Header
        backendConnected={backendConnected}
        runningProcessesCount={runningProcessesCount}
        onOpenSettings={() => setActiveTab("settings")}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={handleToggleSidebar}
      />

      {/* 2. Middle Body: Sidebar + Main Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {sidebarVisible && (
          <Sidebar
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            collapsed={sidebarCollapsed}
            onToggleCollapse={handleToggleCollapse}
            onHide={handleHideSidebar}
          />
        )}

        {!sidebarVisible && (
          <button
            type="button"
            onClick={handleToggleSidebar}
            title="Show Sidebar (⌘B)"
            className="absolute top-2.5 left-2.5 z-30 p-1.5 rounded-md bg-zinc-950/90 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 border border-zinc-700/80 shadow-lg backdrop-blur transition cursor-pointer flex items-center gap-1.5 group text-xs"
          >
            <svg className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
            </svg>
            <span className="hidden group-hover:inline text-[11px] font-medium text-zinc-300">Show Sidebar (⌘B)</span>
          </button>
        )}

        <main className="flex-1 min-w-0 overflow-y-auto bg-zinc-900/40 relative">
          <div className={activeTab === "projects" ? "h-full w-full" : "hidden"}>
            <ProjectsView
              isActive={activeTab === "projects"}
              onNavigateToTerminal={handleNavigateToTerminal}
              onNavigateToGit={handleNavigateToGit}
            />
          </div>
          <div className={activeTab === "terminal" ? "h-full w-full" : "hidden"}>
            <TerminalView
              isActive={activeTab === "terminal"}
              initialSelection={terminalSelection}
            />
          </div>
          <div className={activeTab === "processes" ? "h-full w-full" : "hidden"}>
            <ProcessesView
              isActive={activeTab === "processes"}
              onNavigateToTerminal={handleNavigateToTerminal}
              onNavigateToProjects={() => setActiveTab("projects")}
            />
          </div>
          <div className={activeTab === "git" ? "h-full w-full" : "hidden"}>
            <GitView
              isActive={activeTab === "git"}
              initialSelection={gitSelection}
            />
          </div>
          <div className={activeTab === "api-tester" ? "h-full w-full" : "hidden"}>
            <ApiTesterView />
          </div>
          <div className={activeTab === "database" ? "h-full w-full" : "hidden"}>
            <DatabaseView />
          </div>
          <div className={activeTab === "env" ? "h-full w-full" : "hidden"}>
            <EnvEditorView
              isActive={activeTab === "env"}
            />
          </div>
          <div className={activeTab === "settings" ? "h-full w-full" : "hidden"}>
            <SettingsView />
          </div>
        </main>
      </div>

      {/* 3. Status Bar Shell */}
      <StatusBar
        backendConnected={backendConnected}
        runningProcessesCount={runningProcessesCount}
        port={3000}
      />
    </div>
  );
}
