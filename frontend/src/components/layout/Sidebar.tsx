"use client";

import { NAV_ITEMS } from "@/constants/navigation";
import { NavItemId } from "@/types/navigation";
import { cn } from "@/lib/utils";

interface SidebarProps {
  activeTab: NavItemId;
  onSelectTab: (tab: NavItemId) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function getNavIcon(id: NavItemId) {
  switch (id) {
    case "projects":
      return (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      );
    case "terminal":
      return (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "processes":
      return (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
    case "git":
      return (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 17h.01M17 7h.01M7 7a2 2 0 100-4 2 2 0 000 4zm0 14a2 2 0 100-4 2 2 0 000 4zm10-10a2 2 0 100-4 2 2 0 000 4zM7 7v6m10-4v2a4 4 0 01-4 4H7" />
        </svg>
      );
    case "api-tester":
      return (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      );
    case "env":
      return (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      );
    case "database":
      return (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      );
    case "settings":
      return (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    default:
      return null;
  }
}

export function Sidebar({
  activeTab,
  onSelectTab,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  if (collapsed) {
    return (
      <aside className="w-14 border-r border-zinc-800 bg-zinc-950 flex flex-col items-center py-2 shrink-0 select-none transition-all duration-200">
        {/* Compact Nav Item Icons */}
        <nav className="flex-1 flex flex-col items-center gap-1.5 w-full px-1.5" aria-label="DevDesk Navigation">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                title={`${item.label} (${item.shortcut})`}
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center relative transition-all cursor-pointer group",
                  isActive
                    ? "bg-zinc-800 text-cyan-400 shadow-sm border border-cyan-800/40"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent"
                )}
              >
                {getNavIcon(item.id)}
                {isActive && (
                  <span className="absolute left-0.5 top-1/2 -translate-y-1/2 w-1 h-4 rounded-r bg-cyan-400" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Expand Sidebar Button at Bottom */}
        {onToggleCollapse && (
          <div className="pt-2 border-t border-zinc-800/80 w-full flex justify-center">
            <button
              onClick={onToggleCollapse}
              title="Expand Sidebar (⌘B)"
              className="w-10 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className="w-56 border-r border-zinc-800 bg-zinc-950 flex flex-col shrink-0 select-none transition-all duration-200">
      <nav className="p-2 space-y-1 flex-1 overflow-y-auto no-scrollbar" aria-label="DevDesk Navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={cn(
                "w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-all text-left group cursor-pointer",
                isActive
                  ? "bg-zinc-800/90 text-zinc-100 shadow-sm border border-zinc-700/60"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={cn("transition-colors", isActive ? "text-cyan-400" : "text-zinc-400 group-hover:text-zinc-200")}>
                  {getNavIcon(item.id)}
                </span>
                <span className="truncate">{item.label}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {item.shortcut && (
                  <kbd
                    className={cn(
                      "font-mono text-[10px] px-1 py-0.5 rounded transition-colors",
                      isActive
                        ? "text-zinc-300 bg-zinc-700/50"
                        : "text-zinc-500 group-hover:text-zinc-400 bg-zinc-900/60"
                    )}
                  >
                    {item.shortcut}
                  </kbd>
                )}
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                )}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Footer with Collapse Control */}
      {onToggleCollapse && (
        <div className="p-2 border-t border-zinc-800/80 text-xs">
          <button
            onClick={onToggleCollapse}
            title="Collapse Sidebar (⌘B)"
            className="w-full flex items-center justify-center gap-2 px-2.5 py-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition cursor-pointer text-xs font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            <span>Collapse</span>
          </button>
        </div>
      )}
    </aside>
  );
}
