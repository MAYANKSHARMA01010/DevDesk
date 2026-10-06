export function Header() {
  return (
    <header className="h-12 border-b border-zinc-800 bg-zinc-950 px-4 flex items-center justify-between select-none shrink-0">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-6 h-6 rounded bg-zinc-800 border border-zinc-700 text-xs font-mono font-bold text-zinc-100">
          D
        </div>
        <span className="font-semibold text-sm tracking-tight text-zinc-100">
          DevDesk
        </span>
      </div>

      <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="font-mono text-[11px] font-medium tracking-wide">
          System Ready
        </span>
      </div>
    </header>
  );
}
