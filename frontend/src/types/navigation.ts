export type NavItemId =
  | "projects"
  | "terminal"
  | "processes"
  | "git"
  | "api-tester"
  | "database"
  | "env";

export interface NavItem {
  id: NavItemId;
  label: string;
  description: string;
}
