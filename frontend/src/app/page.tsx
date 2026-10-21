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
      />

      {/* 2. Middle Body: Sidebar + Main Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />
        <main className="flex-1 min-w-0 overflow-y-auto bg-zinc-900/40">
          {renderMainContent()}
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
