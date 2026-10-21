"use client";

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
  const isDesktop = typeof window !== "undefined" && Boolean(window.electron);

  const displayStatus =
    statusText ||
    (backendConnected ? "Backend Connected (Port 5001)" : "Backend Disconnected");

  return (
    <footer className="h-7 border-t border-zinc-800 bg-zinc-950 px-4 flex items-center justify-between text-[11px] font-mono text-zinc-400 select-none shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              backendConnected ? "bg-emerald-500" : "bg-rose-500 animate-pulse"
            }`}
          />
          <span className={backendConnected ? "text-zinc-300" : "text-rose-400"}>
            {displayStatus}
          </span>
        </div>

        {backendConnected && (
          <div className="hidden sm:flex items-center gap-1.5 text-zinc-500 border-l border-zinc-800 pl-4">
            <span>Processes:</span>
            <span
              className={
                runningProcessesCount > 0
                  ? "text-cyan-400 font-semibold"
                  : "text-zinc-400"
              }
            >
              {runningProcessesCount} active
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-zinc-400">
        <div className="hidden md:flex items-center gap-1.5">
          <span className="text-zinc-500">Env:</span>
          <span className="text-zinc-300">
            {isDesktop ? "Electron Native" : "Web Browser"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500">UI Port:</span>
          <span className="text-zinc-200 font-semibold">{port}</span>
        </div>
      </div>
    </footer>
  );
}

