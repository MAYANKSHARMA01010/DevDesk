export type NavItemId =
  | "projects"
  | "terminal"
  | "processes"
  | "git"
  | "api-tester"
  | "database"
  | "env"
  | "settings";

export interface NavItem {
  id: NavItemId;
  label: string;
  description: string;
  shortcut?: string;
}
