import { NavItem } from "@/types/navigation";

export const NAV_ITEMS: NavItem[] = [
  {
    id: "projects",
    label: "Projects",
    description: "Scan folders, detect project types, and open workspaces",
    shortcut: "⌘1",
  },
  {
    id: "terminal",
    label: "Terminal",
    description: "Embedded shell, scripts, and dev server output",
    shortcut: "⌘2",
  },
  {
    id: "processes",
    label: "Processes",
    description: "Active server ports, process manager, and killers",
    shortcut: "⌘3",
  },
  {
    id: "git",
    label: "Git",
    description: "Branch status, changes, commits, and remote syncing",
    shortcut: "⌘4",
  },
  {
    id: "api-tester",
    label: "API Tester",
    description: "HTTP endpoint requester and response inspection",
    shortcut: "⌘5",
  },
  {
    id: "env",
    label: ".env",
    description: "Environment variable viewer and secure editor",
    shortcut: "⌘6",
  },
  {
    id: "database",
    label: "Database",
    description: "SQL query runner, tables, and connection status",
    shortcut: "⌘7",
  },
  {
    id: "settings",
    label: "Settings",
    description: "System diagnostics, versions, paths, and keyboard shortcuts",
    shortcut: "⌘,",
  },
];
