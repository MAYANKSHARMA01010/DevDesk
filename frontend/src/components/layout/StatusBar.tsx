interface StatusBarProps {
  statusText?: string;
  port?: number | string;
}

export function StatusBar({
  statusText = "Backend Connected",
  port = 3000,
}: StatusBarProps) {
  return (
    <footer className="h-7 border-t border-zinc-800 bg-zinc-950 px-4 flex items-center justify-between text-[11px] font-mono text-zinc-400 select-none shrink-0">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span>Status: {statusText}</span>
      </div>
      <div className="flex items-center gap-1.5 text-zinc-400">
        <span>Port:</span>
        <span className="text-zinc-200 font-semibold">{port}</span>
      </div>
    </footer>
  );
}
