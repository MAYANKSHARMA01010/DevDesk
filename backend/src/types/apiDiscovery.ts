import { HttpMethod } from "./apiTester.js";

export interface ApiParamInfo {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  sampleValue?: string;
}

export interface ApiRequestBodyInfo {
  contentType: string;
  schemaType?: string;
  sampleJson?: string;
  fields?: ApiParamInfo[];
}

export interface ApiResponseInfo {
  statusCode: number;
  statusText?: string;
  description?: string;
  sampleJson?: string;
}

export interface HowToUseCodeSnippets {
  curl: string;
  fetchJs: string;
  python: string;
}

export interface DiscoveredApiEndpoint {
  id: string;
  method: HttpMethod;
  path: string;
  name: string;
  description?: string;
  category: string;
  sourceFile: string;
  sourceLine: number;
  pathParams: ApiParamInfo[];
  queryParams: ApiParamInfo[];
  headers: { key: string; value: string; description?: string }[];
  requestBody?: ApiRequestBodyInfo;
  responses: ApiResponseInfo[];
  howToUse: HowToUseCodeSnippets;
  framework:
    | "express"
    | "nextjs"
    | "nestjs"
    | "fastapi"
    | "flask"
    | "openapi"
    | "generic";
}

export interface ApiDiscoveryResult {
  projectId: string;
  projectName: string;
  projectPath: string;
  framework: string;
  detectedPort?: number;
  baseUrlSuggestion: string;
  endpointsCount: number;
  endpoints: DiscoveredApiEndpoint[];
}

export interface ApiDiscoveryResponse {
  success: boolean;
  data?: ApiDiscoveryResult;
  error?: string;
}
