export type GitFileStatusType =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "ignored"
  | "unmerged"
  | "clean";

export interface GitFileChange {
  path: string;
  originalPath?: string;
  staged: boolean;
  unstaged: boolean;
  indexStatus: GitFileStatusType;
  workingTreeStatus: GitFileStatusType;
}

export interface GitStatusResult {
  projectId: string;
  projectName: string;
  projectPath: string;
  repositoryRoot: string;
  currentBranch: string | null;
  isClean: boolean;
  isDetached: boolean;
  hasCommits: boolean;
  ahead: number;
  behind: number;
  upstream: string | null;
  files: GitFileChange[];
  stagedFiles: GitFileChange[];
  unstagedFiles: GitFileChange[];
  untrackedFiles: GitFileChange[];
}

export interface GitBranchesResult {
  currentBranch: string | null;
  isDetached: boolean;
  localBranches: string[];
  remoteBranches: string[];
}

export interface GitDiffResult {
  file: string;
  staged: boolean;
  isUntracked: boolean;
  isBinary: boolean;
  isTruncated: boolean;
  addedLines: number;
  removedLines: number;
  diff: string;
}

export interface GitCommitItem {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export interface GitHistoryResult {
  commits: GitCommitItem[];
  total: number;
}

export interface GitCommitResult {
  commitHash: string;
  message: string;
  summary: string;
}

// API Responses
export interface GitStatusResponse {
  success: boolean;
  data?: GitStatusResult;
  error?: string;
}

export interface GitBranchesResponse {
  success: boolean;
  data?: GitBranchesResult;
  error?: string;
}

export interface GitCheckoutResponse {
  success: boolean;
  data?: {
    branch: string;
    message: string;
  };
  error?: string;
}

export interface GitDiffResponse {
  success: boolean;
  data?: GitDiffResult;
  error?: string;
}

export interface GitStageResponse {
  success: boolean;
  data?: {
    stagedCount: number;
    files: string[];
  };
  error?: string;
}

export interface GitUnstageResponse {
  success: boolean;
  data?: {
    unstagedCount: number;
    files: string[];
  };
  error?: string;
}

export interface GitCommitResponse {
  success: boolean;
  data?: GitCommitResult;
  error?: string;
}

export interface GitHistoryResponse {
  success: boolean;
  data?: GitHistoryResult;
  error?: string;
}
