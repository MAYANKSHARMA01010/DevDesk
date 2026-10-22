export type ProcessStatus =
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "exited"
  | "failed";

export type ProcessLogStream = "stdout" | "stderr" | "system";

export interface ProcessLogEntry {
  id: number;
  timestamp: string;
  stream: ProcessLogStream;
  message: string;
}

export type PortDetectionStatus =
  | "detected"
  | "none"
  | "scanning"
  | "failed"
  | "not_applicable";

export interface ProcessPortInfo {
  processId: string;
  pid?: number;
  ports: number[];
  portStatus: PortDetectionStatus;
}

export interface ManagedProcess {
  id: string;
  projectId: string;
  workspaceId: string;
  projectName: string;
  script: string;
  command: string;
  status: ProcessStatus;
  pid?: number;
  exitCode: number | null;
  startedAt: string;
  stoppedAt?: string;
  ports?: number[];
  portStatus?: PortDetectionStatus;
}

export interface ProcessLogsResult {
  processId: string;
  status: ProcessStatus;
  exitCode: number | null;
  logs: ProcessLogEntry[];
  latestSequenceId: number;
}

export interface ProjectScriptsResult {
  projectId: string;
  scripts: Record<string, string>;
}

export interface ProcessResponse {
  success: boolean;
  data?: ManagedProcess;
  error?: string;
}

export interface ProcessesListResponse {
  success: boolean;
  data?: ManagedProcess[];
  error?: string;
}

export interface ProcessLogsResponse {
  success: boolean;
  data?: ProcessLogsResult;
  error?: string;
}

export interface ProjectScriptsResponse {
  success: boolean;
  data?: ProjectScriptsResult;
  error?: string;
}

export interface ProcessPortsResponse {
  success: boolean;
  data?: ProcessPortInfo[];
  error?: string;
}

export interface SystemPortInfo {
  port: number;
  pid: number;
  processName: string;
  user: string;
  protocol: string;
  address: string;
  command?: string;
  cwd?: string;
  isDevDeskManaged?: boolean;
  devDeskProcessId?: string;
}

export interface SystemPortsResponse {
  success: boolean;
  data?: SystemPortInfo[];
  error?: string;
}

