"use client";

import { useEffect, useState } from "react";
import { getBackendDisplayLabel } from "@/config/env";

interface StatusBarProps {
  statusText?: string;
  backendConnected?: boolean;
  runningProcessesCount?: number;
  port?: number | string;
}

export function StatusBar({
  statusText,
  backendConnected = true,
  runningProcessesCount = 0,
  port = 3000,
}: StatusBarProps) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setIsDesktop(typeof window !== "undefined" && Boolean(window.electron));
  }, []);

  const displayStatus =
    statusText ||
    (backendConnected
      ? `Backend Connected · ${getBackendDisplayLabel()}`
      : "Backend Disconnected");

  return (
    <footer className="h-7 border-t border-[#303931] bg-[#171B17] px-4 flex items-center justify-between text-[11px] font-mono text-[#747D72] select-none shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              backendConnected ? "bg-[#82B58A]" : "bg-[#D98279]"
            }`}
          />
          <span className={backendConnected ? "text-[#ECEFE8]" : "text-[#D98279]"}>
            {displayStatus}
          </span>
        </div>

        {backendConnected && (
          <div className="hidden sm:flex items-center gap-1.5 text-[#747D72] border-l border-[#303931] pl-4">
            <span>Processes:</span>
            <span
              className={
                runningProcessesCount > 0
                  ? "text-[#A6B58A] font-medium"
                  : "text-[#A7AEA2]"
              }
            >
              {runningProcessesCount} active
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-[#747D72]">
        <div className="hidden md:flex items-center gap-1.5">
          <span>Env:</span>
          <span className="text-[#A7AEA2]">
            {isDesktop ? "Electron Native" : "Web Browser"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span>UI Port:</span>
          <span className="text-[#ECEFE8] font-medium">{port}</span>
        </div>
      </div>
    </footer>
  );
}

