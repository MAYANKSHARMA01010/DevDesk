export function ProcessesView() {
  return (
    <div className="flex flex-col h-full p-6 text-zinc-100">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Process & Port Manager</h2>
        <p className="text-xs text-zinc-400 mt-1">
          Monitor listening ports, active node services, and kill stuck processes.
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-8 bg-zinc-900/30 text-center">
        <div className="w-10 h-10 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-mono text-zinc-400 mb-3">
          ⚡
        </div>
        <p className="text-sm font-medium text-zinc-200">No Active Background Processes</p>
        <p className="text-xs text-zinc-500 mt-1 max-w-sm">
          Active web servers, database listeners, and occupied ports will appear here.
        </p>
      </div>
    </div>
  );
}
