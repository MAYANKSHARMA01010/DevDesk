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
      <nav className="p-2 space-y-1" aria-label="DevDesk Navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all text-left",
                isActive
                  ? "bg-zinc-800/90 text-zinc-100 shadow-sm border border-zinc-700/60"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent"
              )}
            >
              <span>{item.label}</span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
