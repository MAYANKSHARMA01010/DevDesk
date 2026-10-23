"use client";

import { useEffect, useState } from "react";

interface HeaderProps {
  backendConnected?: boolean;
  runningProcessesCount?: number;
  onOpenSettings?: () => void;
}

export function Header({
  backendConnected = true,
  runningProcessesCount = 0,
  onOpenSettings,
}: HeaderProps) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setIsDesktop(typeof window !== "undefined" && Boolean(window.electron));
  }, []);

  return (
    <header className="h-12 border-b border-[#303931] bg-[#171B17] px-4 flex items-center justify-between select-none shrink-0">
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon.png"
          alt="DevDesk"
          className="w-6 h-6 rounded-md object-contain border border-[#303931] shadow-xs"
        />
        <span className="font-semibold text-sm tracking-tight text-[#ECEFE8]">
          DevDesk
        </span>

        {isDesktop && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#252C26] border border-[#303931] text-[#A7AEA2]">
            Desktop Shell
          </span>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {runningProcessesCount > 0 && (
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[rgba(166,181,138,0.12)] border border-[#A6B58A]/35 text-[11px] font-mono text-[#A6B58A]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A6B58A]" />
            {runningProcessesCount} running
          </span>
        )}

        <div
          className={`flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs transition-colors ${
            backendConnected
              ? "bg-[#1D231E] border-[#303931] text-[#ECEFE8]"
              : "bg-[#252C26] border-[#D98279]/50 text-[#D98279]"
          }`}
        >
          <span className="flex h-2 w-2 items-center justify-center">
            <span
              className={`inline-flex rounded-full h-1.5 w-1.5 ${
                backendConnected ? "bg-[#82B58A]" : "bg-[#D98279]"
              }`}
            />
          </span>
          <span className="font-mono text-[11px] font-medium tracking-wide">
            {backendConnected ? "System Ready" : "Backend Offline"}
          </span>
        </div>

        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            title="Settings & Diagnostics (⌘,)"
            className="p-1.5 rounded-md text-[#A7AEA2] hover:text-[#ECEFE8] hover:bg-[#252C26] border border-transparent hover:border-[#303931] transition cursor-pointer"
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

