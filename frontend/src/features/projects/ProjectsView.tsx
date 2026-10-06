"use client";

import { useState } from "react";
import { DiscoveredProject } from "@/types/project";
import { scanProjects } from "@/services/projects";

type ViewState = "idle" | "scanning" | "success" | "empty" | "error";

export function ProjectsView() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [projects, setProjects] = useState<DiscoveredProject[]>([]);
  const [status, setStatus] = useState<ViewState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSelectDirectory() {
    // 1. Ensure Electron bridge exists
    if (!window.electron?.selectDirectory) {
      setStatus("error");
      setErrorMessage(
        "Native directory picker is only available in the DevDesk desktop app. Please run the desktop application."
      );
      return;
    }

    try {
      // 2. Open native macOS folder dialog via preload IPC
      const chosenPath = await window.electron.selectDirectory();

      // 3. If user cancelled, do nothing
      if (!chosenPath) {
        return;
      }

      setSelectedPath(chosenPath);
      setStatus("scanning");
      setErrorMessage(null);

      // 4. Fetch discovered projects from backend API
      const discovered = await scanProjects(chosenPath);

      setProjects(discovered);
      setStatus(discovered.length === 0 ? "empty" : "success");
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to scan project root";
      setStatus("error");
      setErrorMessage(errorMsg);
    }
  }

  async function handleRescan() {
    if (!selectedPath) return;
    setStatus("scanning");
    setErrorMessage(null);
    try {
      const discovered = await scanProjects(selectedPath);
      setProjects(discovered);
      setStatus(discovered.length === 0 ? "empty" : "success");
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to scan project root";
      setStatus("error");
      setErrorMessage(errorMsg);
    }
  }

  function renderBadgeType(type: DiscoveredProject["type"]) {
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

  function renderBadgePkg(pm: DiscoveredProject["packageManager"]) {
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

  return (
    <div className="flex flex-col h-full p-6 text-zinc-100 max-w-5xl">
      {/* 1. Header & Actions */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Projects</h2>
          <p className="text-xs text-zinc-400 mt-1">
            Scan workspace directories and manage detected applications.
          </p>
        </div>

        {selectedPath && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleRescan}
              disabled={status === "scanning"}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50 transition-all cursor-pointer"
            >
              Rescan
            </button>
            <button
              onClick={handleSelectDirectory}
              disabled={status === "scanning"}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-100 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-50 transition-all cursor-pointer"
            >
              Change Root
            </button>
          </div>
        )}
      </div>

      {/* 2. Selected Root Directory Display */}
      {selectedPath && (
        <div className="mb-6 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 block">
              Project Root
            </span>
            <span className="text-xs font-mono text-zinc-300 truncate block mt-0.5">
              {selectedPath}
            </span>
          </div>
          {status === "success" && (
            <span className="shrink-0 text-xs text-zinc-400 px-2 py-1 rounded bg-zinc-800/80 border border-zinc-700/60 font-medium">
              {projects.length} {projects.length === 1 ? "Project" : "Projects"}
            </span>
          )}
        </div>
      )}

      {/* 3. Dynamic UI States */}

      {/* State A: Scanning */}
      {status === "scanning" && (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-10 bg-zinc-900/20 text-center">
          <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-zinc-200 animate-spin mb-4" />
          <p className="text-sm font-medium text-zinc-200">
            Scanning projects...
          </p>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm font-mono truncate">
            {selectedPath}
          </p>
        </div>
      )}

      {/* State B: Error */}
      {status === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center border border-red-900/30 rounded-lg p-10 bg-red-950/10 text-center">
          <div className="w-10 h-10 rounded-md bg-red-950/40 border border-red-800/50 flex items-center justify-center text-red-400 mb-3 text-base">
            ⚠️
          </div>
          <p className="text-sm font-semibold text-red-300">Scanning Error</p>
          <p className="text-xs text-red-400/90 mt-1 max-w-md leading-relaxed">
            {errorMessage}
          </p>
          <button
            onClick={handleSelectDirectory}
            className="mt-5 px-3.5 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 transition-all cursor-pointer"
          >
            Select Project Root
          </button>
        </div>
      )}

      {/* State C: Empty (No projects in selected folder) */}
      {status === "empty" && (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-10 bg-zinc-900/30 text-center">
          <div className="w-10 h-10 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm text-zinc-400 mb-3">
            📂
          </div>
          <p className="text-sm font-medium text-zinc-200">
            No projects found in this directory.
          </p>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm leading-relaxed">
            None of the immediate subdirectories contained a valid package.json file.
          </p>
          <button
            onClick={handleSelectDirectory}
            className="mt-5 px-3.5 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 transition-all cursor-pointer"
          >
            Select Another Directory
          </button>
        </div>
      )}

      {/* State D: Initial / Idle */}
      {status === "idle" && (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-10 bg-zinc-900/30 text-center">
          <div className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-base font-mono text-zinc-400 mb-4 shadow-sm">
            📁
          </div>
          <p className="text-sm font-semibold text-zinc-200">
            No Projects Configured
          </p>
          <p className="text-xs text-zinc-400 mt-1 max-w-md leading-relaxed">
            Select a project root directory to automatically discover React, Next.js, and Node.js workspaces.
          </p>
          <button
            onClick={handleSelectDirectory}
            className="mt-6 px-4 py-2 rounded-md text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-zinc-200 transition-all shadow-sm cursor-pointer"
          >
            Select Project Root
          </button>
        </div>
      )}

      {/* State E: Success List */}
      {status === "success" && (
        <div className="space-y-3 overflow-y-auto">
          {projects.map((project) => (
            <div
              key={project.path}
              className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
