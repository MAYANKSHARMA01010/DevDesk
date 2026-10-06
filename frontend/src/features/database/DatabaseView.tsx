export function DatabaseView() {
  return (
    <div className="flex flex-col h-full p-6 text-zinc-100">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Database</h2>
        <p className="text-xs text-zinc-400 mt-1">
          Connect to PostgreSQL or MySQL, query tables, and preview schemas.
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-8 bg-zinc-900/30 text-center">
        <div className="w-10 h-10 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-mono text-zinc-400 mb-3">
          🗄️
        </div>
        <p className="text-sm font-medium text-zinc-200">Database Connection Required</p>
        <p className="text-xs text-zinc-500 mt-1 max-w-sm">
          Connect to a local or remote PostgreSQL / MySQL instance to browse schemas and execute SQL queries.
        </p>
      </div>
    </div>
  );
}
