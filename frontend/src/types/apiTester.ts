export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface ApiTesterRequest {
  requestId?: string;
  method: HttpMethod;
  url: string;
  params?: KeyValuePair[];
  headers?: KeyValuePair[];
  body?: string;
  timeoutMs?: number;
}

export interface ApiTesterResponseResult {
  requestId: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  sizeBytes: number;
  isTruncated: boolean;
  isJson: boolean;
  contentType: string;
}

export interface ApiTesterExecuteResponse {
  success: boolean;
  data?: ApiTesterResponseResult;
  error?: string;
}

export interface ApiTesterCancelResponse {
  success: boolean;
  data?: {
    requestId: string;
    cancelled: boolean;
    message: string;
  };
  error?: string;
}
