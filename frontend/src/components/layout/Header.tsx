"use client";

import { useEffect, useState } from "react";

interface HeaderProps {
  backendConnected?: boolean;
  runningProcessesCount?: number;
  onOpenSettings?: () => void;
  sidebarVisible?: boolean;
  onToggleSidebar?: () => void;
}

export function Header({
  backendConnected = true,
  runningProcessesCount = 0,
  onOpenSettings,
  sidebarVisible = true,
  onToggleSidebar,
}: HeaderProps) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setIsDesktop(typeof window !== "undefined" && Boolean(window.electron));
  }, []);

  return (
    <header className="h-12 border-b border-zinc-800 bg-zinc-950 px-4 flex items-center justify-between select-none shrink-0">
      <div className="flex items-center gap-2.5">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`p-1.5 rounded-md border transition cursor-pointer ${
              sidebarVisible
                ? "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border-transparent hover:border-zinc-800"
                : "text-cyan-400 bg-cyan-950/40 border-cyan-800/60 hover:bg-cyan-900/50"
            }`}
            title={sidebarVisible ? "Hide Sidebar (⌘B)" : "Show Sidebar (⌘B)"}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
            </svg>
          </button>
        )}

        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon.png"
            alt="DevDesk"
            className="w-6 h-6 rounded-md object-contain border border-zinc-700/60 shadow-sm"
          />
          <span className="font-semibold text-sm tracking-tight text-zinc-100">
            DevDesk
          </span>
        </div>

        {isDesktop && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
            Desktop Shell
          </span>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {runningProcessesCount > 0 && (
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-800/60 text-[11px] font-mono text-cyan-300">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            {runningProcessesCount} running
          </span>
        )}

        <div
          className={`flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs transition-colors ${
            backendConnected
              ? "bg-zinc-900 border-zinc-800 text-zinc-300"
              : "bg-rose-950/50 border-rose-800 text-rose-300"
          }`}
        >
          <span className="relative flex h-2 w-2">
            {backendConnected ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            )}
          </span>
          <span className="font-mono text-[11px] font-medium tracking-wide">
            {backendConnected ? "System Ready" : "Backend Offline"}
          </span>
        </div>

        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            title="Settings & Diagnostics (⌘,)"
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}

