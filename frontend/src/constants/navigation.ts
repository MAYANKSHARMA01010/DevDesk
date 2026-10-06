import { NavItem } from "@/types/navigation";

export const NAV_ITEMS: NavItem[] = [
  {
    id: "projects",
    label: "Projects",
    description: "Scan folders, detect project types, and open workspaces",
  },
  {
    id: "terminal",
    label: "Terminal",
    description: "Embedded shell, scripts, and dev server output",
  },
  {
    id: "processes",
    label: "Processes",
    description: "Active server ports, process manager, and killers",
  },
  {
    id: "git",
    label: "Git",
    description: "Branch status, changes, commits, and remote syncing",
  },
  {
    id: "api-tester",
    label: "API Tester",
    description: "HTTP endpoint requester and response inspection",
  },
  {
    id: "database",
    label: "Database",
    description: "SQL query runner, tables, and connection status",
  },
  {
    id: "env",
    label: ".env",
    description: "Environment variable viewer and secure editor",
  },
];
