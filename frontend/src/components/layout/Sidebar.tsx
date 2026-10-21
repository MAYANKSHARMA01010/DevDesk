"use client";

import { NAV_ITEMS } from "@/constants/navigation";
import { NavItemId } from "@/types/navigation";
import { cn } from "@/lib/utils";

interface SidebarProps {
  activeTab: NavItemId;
  onSelectTab: (tab: NavItemId) => void;
}

export function Sidebar({ activeTab, onSelectTab }: SidebarProps) {
  return (
    <aside className="w-56 border-r border-zinc-800 bg-zinc-950 flex flex-col shrink-0 select-none">
      <nav className="p-2 space-y-1 flex-1 overflow-y-auto" aria-label="DevDesk Navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all text-left group",
                isActive
                  ? "bg-zinc-800/90 text-zinc-100 shadow-sm border border-zinc-700/60"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent"
              )}
            >
              <span className="truncate">{item.label}</span>
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
    </aside>
  );
}
