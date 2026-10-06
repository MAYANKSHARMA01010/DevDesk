export type ProjectType = "Next.js" | "React" | "Node.js / Express" | "Node.js";

export type PackageManager = "pnpm" | "yarn" | "npm" | "unknown";

export interface DiscoveredProject {
  name: string;
  path: string;
  type: ProjectType;
  packageManager: PackageManager;
}

export interface ProjectScanResponse {
  success: boolean;
  data?: DiscoveredProject[];
  error?: string;
}
