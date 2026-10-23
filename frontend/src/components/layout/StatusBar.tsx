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
    <footer className="h-7 border-t border-[#303642] bg-[#171A20] px-4 flex items-center justify-between text-[11px] font-mono text-[#7C8594] select-none shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              backendConnected ? "bg-[#77B58A]" : "bg-[#E18B8B]"
            }`}
          />
          <span className={backendConnected ? "text-[#E8EBF1]" : "text-[#E18B8B]"}>
            {displayStatus}
          </span>
        </div>

        {backendConnected && (
          <div className="hidden sm:flex items-center gap-1.5 text-[#7C8594] border-l border-[#303642] pl-4">
            <span>Processes:</span>
            <span
              className={
                runningProcessesCount > 0
                  ? "text-[#8CA9CF] font-medium"
                  : "text-[#A5ADBA]"
              }
            >
              {runningProcessesCount} active
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-[#7C8594]">
        <div className="hidden md:flex items-center gap-1.5">
          <span>Env:</span>
          <span className="text-[#A5ADBA]">
            {isDesktop ? "Electron Native" : "Web Browser"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span>UI Port:</span>
          <span className="text-[#E8EBF1] font-medium">{port}</span>
        </div>
      </div>
    </footer>
  );
}
