export type ProjectType = "Next.js" | "React" | "Node.js / Express" | "Node.js";

export type PackageManager = "pnpm" | "yarn" | "npm" | "unknown";

export interface DiscoveredProject {
  name: string;
  path: string;
  type: ProjectType;
  packageManager: PackageManager;
}

export interface SavedProject {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
  type: ProjectType;
  packageManager: PackageManager;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  rootPath: string;
  lastOpenedAt: string;
  lastScannedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceWithProjects extends Workspace {
  projects: SavedProject[];
}

export interface WorkspacesResponse {
  success: boolean;
  data?: WorkspaceWithProjects[];
  error?: string;
}

export interface WorkspaceResponse {
  success: boolean;
  data?: WorkspaceWithProjects;
  error?: string;
  message?: string;
}

export interface ProjectScanResponse {
  success: boolean;
  data?: DiscoveredProject[];
  error?: string;
}

