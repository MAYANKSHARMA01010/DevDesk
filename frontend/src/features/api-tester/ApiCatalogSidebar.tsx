"use client";

import { useMemo, useState } from "react";
import { DiscoveredApiEndpoint } from "@/types/apiDiscovery";
import { HttpMethod } from "@/types/apiTester";

interface ApiCatalogSidebarProps {
  endpoints: DiscoveredApiEndpoint[];
  loading: boolean;
  onRefresh: () => void;
  onSelectEndpoint: (endpoint: DiscoveredApiEndpoint) => void;
  onAnalyzeEndpoint: (endpoint: DiscoveredApiEndpoint) => void;
  activeEndpointId?: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function getMethodBadgeClass(method: HttpMethod): string {
  switch (method) {
    case "GET":
      return "text-cyan-400 border-cyan-800/80 bg-cyan-950/40";
    case "POST":
      return "text-emerald-400 border-emerald-800/80 bg-emerald-950/40";
    case "PUT":
      return "text-amber-400 border-amber-800/80 bg-amber-950/40";
    case "PATCH":
      return "text-violet-400 border-violet-800/80 bg-violet-950/40";
    case "DELETE":
      return "text-rose-400 border-rose-800/80 bg-rose-950/40";
    default:
      return "text-zinc-400 border-zinc-700 bg-zinc-800/40";
  }
}

export function ApiCatalogSidebar({
  endpoints,
  loading,
  onRefresh,
  onSelectEndpoint,
  onAnalyzeEndpoint,
  activeEndpointId,
  collapsed,
  onToggleCollapse,
}: ApiCatalogSidebarProps) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedMethod, setSelectedMethod] = useState<string>("ALL");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Deduplicate endpoints by HTTP Method + Path to guarantee no duplicate cards
  const uniqueEndpoints = useMemo(() => {
    const map = new Map<string, DiscoveredApiEndpoint>();
    for (const ep of endpoints) {
      const key = `${ep.method.toUpperCase()}:${ep.path}`;
      if (!map.has(key)) {
        map.set(key, ep);
      } else {
        const existing = map.get(key)!;
        if (existing.category === "General" && ep.category && ep.category !== "General") {
          existing.category = ep.category;
        }
        if (!existing.description && ep.description) {
          existing.description = ep.description;
        }
        if (!existing.requestBody && ep.requestBody) {
          existing.requestBody = ep.requestBody;
        }
      }
    }
    return Array.from(map.values());
  }, [endpoints]);

  // Filter endpoints by search query & HTTP method
  const filteredEndpoints = useMemo(() => {
    return uniqueEndpoints.filter((ep) => {
      const matchMethod =
        selectedMethod === "ALL" || ep.method === selectedMethod;
      const matchQuery =
        !searchQuery.trim() ||
        ep.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ep.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ep.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ep.description && ep.description.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchMethod && matchQuery;
    });
  }, [uniqueEndpoints, searchQuery, selectedMethod]);

  // Group filtered endpoints by category
  const groupedCategories = useMemo(() => {
    const map = new Map<string, DiscoveredApiEndpoint[]>();
    for (const ep of filteredEndpoints) {
      const cat = ep.category || "General";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(ep);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredEndpoints]);

  const toggleCategoryCollapse = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-3 px-1.5 bg-zinc-950 border-r border-zinc-800 shrink-0 select-none">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition cursor-pointer"
          title="Expand Discovered APIs Panel"
        >
          <span>📑</span>
        </button>
        <span className="text-[10px] font-mono text-zinc-500 mt-4 [writing-mode:vertical-lr] tracking-widest uppercase">
          APIs ({uniqueEndpoints.length})
        </span>
      </div>
    );
  }

  return (
    <div className="w-80 flex flex-col h-full bg-zinc-950 border-r border-zinc-800 shrink-0 overflow-hidden select-none">
      {/* Header Bar */}
      <div className="p-3 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-200">
            Discovered APIs
          </span>
          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
            {uniqueEndpoints.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Refresh Scan Button */}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition disabled:opacity-40 cursor-pointer"
            title="Rescan project APIs"
          >
            <span className={loading ? "inline-block animate-spin" : ""}>🔄</span>
          </button>

          {/* Collapse Panel Button */}
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition cursor-pointer"
            title="Collapse panel"
          >
            ◀
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="p-2.5 border-b border-zinc-800/80 space-y-2 shrink-0 bg-zinc-900/30">
        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search endpoints..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-2.5 py-1 text-xs font-mono rounded bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1 text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Method Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
          {["ALL", "GET", "POST", "PUT", "DELETE"].map((m) => {
            const isSelected = selectedMethod === m;
            return (
              <button
                key={m}
                onClick={() => setSelectedMethod(m)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer shrink-0 ${
                  isSelected
                    ? "bg-zinc-700 text-white shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Endpoints List Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-500">
            <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-zinc-300 animate-spin mb-2" />
            <p className="text-xs">Scanning project routes...</p>
          </div>
        ) : endpoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-500 p-4">
            <p className="text-xs font-medium text-zinc-400">No APIs Discovered</p>
            <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
              Scan a backend, Express, Next.js, NestJS, or FastAPI project to automatically track all available endpoints.
            </p>
            <button
              onClick={onRefresh}
              className="mt-3 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded transition cursor-pointer"
            >
              Scan Project APIs
            </button>
          </div>
        ) : filteredEndpoints.length === 0 ? (
          <div className="py-8 text-center text-zinc-500 text-xs">
            No endpoints matching filter.
          </div>
        ) : (
          groupedCategories.map(([category, items]) => {
            const isCategoryCollapsed = collapsedCategories.has(category);

            return (
              <div key={category} className="space-y-1">
                {/* Category Header */}
                <button
                  type="button"
                  onClick={() => toggleCategoryCollapse(category)}
                  className="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 rounded transition cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="text-[10px]">{isCategoryCollapsed ? "▶" : "▼"}</span>
                    <span>{category}</span>
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {items.length}
                  </span>
                </button>

                {/* Endpoints under this category */}
                {!isCategoryCollapsed && (
                  <div className="space-y-1 pl-1">
                    {items.map((ep, epIdx) => {
                      const isActive = activeEndpointId === ep.id;

                      return (
                        <div
                          key={ep.id ? `${ep.id}-${epIdx}` : `ep-${epIdx}`}
                          className={`group p-2 rounded-md border transition flex flex-col gap-1 cursor-pointer ${
                            isActive
                              ? "bg-zinc-900 border-zinc-700 shadow-xs"
                              : "bg-zinc-950/60 border-zinc-900 hover:bg-zinc-900/50 hover:border-zinc-800"
                          }`}
                          onClick={() => onSelectEndpoint(ep)}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            {/* Method Badge + Path */}
                            <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border shrink-0 ${getMethodBadgeClass(
                                  ep.method
                                )}`}
                              >
                                {ep.method}
                              </span>
                              <span
                                className="font-mono text-xs text-zinc-200 truncate select-none"
                                title={ep.path}
                              >
                                {ep.path}
                              </span>
                            </div>

                            {/* Quick Action Buttons */}
                            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectEndpoint(ep);
                                }}
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium text-emerald-400 hover:bg-emerald-950/80 border border-emerald-800/50 transition cursor-pointer"
                                title="Load endpoint with complete request & response example"
                              >
                                ✨ Example
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAnalyzeEndpoint(ep);
                                }}
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium text-cyan-400 hover:bg-cyan-950/80 border border-cyan-800/50 transition cursor-pointer"
                                title="View complete details analysis (request, response, how to use)"
                              >
                                🔍 Details
                              </button>
                            </div>
                          </div>

                          {/* Endpoint Summary */}
                          {ep.name && (
                            <p className="text-[10px] text-zinc-400 truncate pl-0.5">
                              {ep.name}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
