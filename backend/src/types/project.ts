export type ProjectType =
  | "Fullstack"
  | "AI / ML / Deep Learning"
  | "Python / FastAPI"
  | "Python / Flask"
  | "Python / Django"
  | "Browser Extension"
  | "Mobile"
  | "Desktop"
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
  | "Monorepo Package"
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
  /** Raw name from package.json / manifest / directory basename */
  name: string;
  /** De-duplicated display name shown in the UI (may include parent qualifier) */
  displayName?: string;
  /** Parent breadcrumb qualifier, e.g. "AutoUpload" or "apps / web" */
  namespace?: string;
  path: string;
  relativePath?: string;
  type: ProjectType;
  packageManager: PackageManager;
  isGitRepo?: boolean;
  gitRoot?: string;
  gitRemote?: string;
  isRoot?: boolean;
  /** True if this project shares its raw name with ≥1 other project in the same scan */
  hasNameCollision?: boolean;
}

export interface ProjectScanResponse {
  success: boolean;
  data?: DiscoveredProject[];
  error?: string;
}
