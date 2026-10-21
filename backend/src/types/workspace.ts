import { DiscoveredProject, PackageManager, ProjectType } from "./project.js";

export interface SavedProject {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
  relativePath?: string;
  type: ProjectType;
  packageManager: PackageManager;
  isGitRepo?: boolean;
  gitRoot?: string;
  gitRemote?: string;
  isRoot?: boolean;
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
