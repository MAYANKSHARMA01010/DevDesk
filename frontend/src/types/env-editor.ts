export interface EnvFileMetadata {
  filename: string;
  exists: boolean;
  isReadable: boolean;
  isWritable: boolean;
  sizeBytes: number;
  lastModified: string | null;
  variableCount: number;
  hasUnsavedChanges?: boolean;
}

export interface EnvVariableEntry {
  id: string;
  key: string;
  value: string;
  comment?: string;
  isSecret?: boolean;
}

export type EnvLineType = "variable" | "comment" | "blank" | "raw";

export interface EnvFileLine {
  type: EnvLineType;
  line: number;
  raw: string;
  key?: string;
  value?: string;
  comment?: string;
}

export interface EnvFileContentResult {
  projectId: string;
  projectName: string;
  filename: string;
  lastModified: string | null;
  sizeBytes: number;
  variables: EnvVariableEntry[];
  lines: EnvFileLine[];
  content: string;
}

export interface EnvFilesListResult {
  projectId: string;
  projectName: string;
  projectPath: string;
  files: EnvFileMetadata[];
}

export interface EnvFileSaveRequest {
  filename: string;
  content?: string;
  variables?: EnvVariableEntry[];
  expectedLastModified?: string | null;
}

export interface EnvFileSaveResult {
  filename: string;
  lastModified: string;
  sizeBytes: number;
  variableCount: number;
  backupCreated?: string;
  message: string;
}

// API Responses
export interface EnvFilesListResponse {
  success: boolean;
  data?: EnvFilesListResult;
  error?: string;
}

export interface EnvFileContentResponse {
  success: boolean;
  data?: EnvFileContentResult;
  error?: string;
}

export interface EnvFileCreateResponse {
  success: boolean;
  data?: {
    filename: string;
    message: string;
  };
  error?: string;
}

export interface EnvFileSaveResponse {
  success: boolean;
  data?: EnvFileSaveResult;
  error?: string;
}

export interface EnvEditorTab {
  id: string;
  title: string;
  workspaceId: string;
  projectId: string;
  projectName?: string;
  selectedFilename: string;
  isDirty?: boolean;
}
