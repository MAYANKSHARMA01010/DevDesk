export type ProjectType =
  | "Next.js"
  | "React"
  | "Node.js / Express"
  | "Node.js"
  | "Python"
  | "Rust"
  | "Go"
  | "Java"
  | "Ruby"
  | "PHP"
  | "Git Repository"
  | "Generic";

export type PackageManager =
  | "pnpm"
  | "yarn"
  | "npm"
  | "bun"
  | "pip"
  | "poetry"
  | "pipenv"
  | "cargo"
  | "go"
  | "maven"
  | "gradle"
  | "gem"
  | "composer"
  | "unknown";

export interface DiscoveredProject {
  name: string;
  path: string;
  relativePath?: string;
  type: ProjectType;
  packageManager: PackageManager;
  isGitRepo?: boolean;
  gitRoot?: string;
  gitRemote?: string;
  isRoot?: boolean;
}

export interface ProjectScanResponse {
  success: boolean;
  data?: DiscoveredProject[];
  error?: string;
}
