"use client";

import { useState } from "react";
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

export default function Home() {
  const [activeTab, setActiveTab] = useState<NavItemId>("projects");
  const [terminalSelection, setTerminalSelection] = useState<{
    workspaceId?: string;
    projectId?: string;
    script?: string;
  } | null>(null);

  const [gitSelection, setGitSelection] = useState<{
    workspaceId?: string;
    projectId?: string;
  } | null>(null);

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
        return <ProjectsView />;
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
      default:
        return <ProjectsView />;
    }
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      {/* 1. Header Shell */}
      <Header />

      {/* 2. Middle Body: Sidebar + Main Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />
        <main className="flex-1 min-w-0 overflow-y-auto bg-zinc-900/40">
          {renderMainContent()}
        </main>
      </div>

      {/* 3. Status Bar Shell */}
      <StatusBar statusText="Backend Connected" port={3000} />
    </div>
  );
}
