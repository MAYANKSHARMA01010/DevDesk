import crypto from "crypto";
import {
  ApiTesterRequest,
  ApiTesterResponseResult,
  HttpMethod,
} from "../../types/apiTester.js";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB limit
const ALLOWED_METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

function getStandardStatusText(status: number): string {
  const map: Record<number, string> = {
    200: "OK",
    201: "Created",
    202: "Accepted",
    204: "No Content",
    301: "Moved Permanently",
    302: "Found",
    304: "Not Modified",
    307: "Temporary Redirect",
    308: "Permanent Redirect",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    409: "Conflict",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
  };
  return map[status] || "Unknown";
}

function tryParseJson(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  const trimmed = text.trim();
  if (
    (!trimmed.startsWith("{") && !trimmed.startsWith("[")) ||
    (!trimmed.endsWith("}") && !trimmed.endsWith("]"))
  ) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

export class ApiTesterService {
  // Registry of in-flight active AbortControllers keyed by requestId
  private activeRequests = new Map<string, AbortController>();

  /**
   * Cancels an active in-flight HTTP request.
   */
  public cancelRequest(requestId: string): boolean {
    if (!requestId) return false;
    const controller = this.activeRequests.get(requestId);
    if (controller) {
      controller.abort(new Error("Request cancelled by user"));
      this.activeRequests.delete(requestId);
      return true;
    }
    return false;
  }

  /**
   * Executes an HTTP request safely with timeouts, bounds, and structured error handling.
   */
  public async executeRequest(
    requestData: ApiTesterRequest
  ): Promise<ApiTesterResponseResult> {
    const { method: rawMethod, url: rawUrl, params, headers, body, timeoutMs } =
      requestData;

    // 1. Method Validation
    if (!rawMethod || typeof rawMethod !== "string") {
      throw new Error("HTTP method is required");
    }

    const method = rawMethod.trim().toUpperCase() as HttpMethod;
    if (!ALLOWED_METHODS.includes(method)) {
      throw new Error(
        `Unsupported HTTP method "${method}". Allowed methods are: ${ALLOWED_METHODS.join(", ")}`
      );
    }

    // 2. URL Validation & Parsing
    if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
      throw new Error("URL is required and cannot be empty");
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl.trim());
    } catch {
      throw new Error(
        `Invalid URL format: "${rawUrl}". Please provide a full valid URL including http:// or https://`
      );
    }

    // Enforce HTTP / HTTPS protocol only (reject file:, data:, javascript:, etc.)
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error(
        `Unsupported protocol "${parsedUrl.protocol}". Only HTTP and HTTPS URLs are supported.`
      );
    }

    // 3. Append Query Parameters
    if (params && Array.isArray(params)) {
      for (const param of params) {
        if (param && param.enabled !== false && param.key && param.key.trim().length > 0) {
          parsedUrl.searchParams.append(param.key.trim(), param.value ?? "");
        }
      }
    }

    // 4. Header Construction
    const headerMap: Record<string, string> = {};
    if (headers && Array.isArray(headers)) {
      for (const h of headers) {
        if (h && h.enabled !== false && h.key && h.key.trim().length > 0) {
          headerMap[h.key.trim()] = h.value ?? "";
        }
      }
    }

    // 5. Body Validation & Processing
    let requestBody: string | undefined = undefined;
    const allowsBody = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

    if (allowsBody && typeof body === "string" && body.length > 0) {
      // Check if Content-Type header specifies application/json
      const contentTypeKey = Object.keys(headerMap).find(
        (k) => k.toLowerCase() === "content-type"
      );
      const isJsonContentType =
        contentTypeKey &&
        headerMap[contentTypeKey].toLowerCase().includes("application/json");

      if (isJsonContentType) {
        try {
          JSON.parse(body);
        } catch (jsonErr: unknown) {
          const err = jsonErr as Error;
          throw new Error(
            `Invalid JSON request body: ${err.message}. Please correct the JSON syntax before sending.`
          );
        }
      }

      requestBody = body;
    }

    // 6. Cancellation & Timeout Setup
    const requestId = requestData.requestId?.trim() || crypto.randomUUID();
    const controller = new AbortController();
    this.activeRequests.set(requestId, controller);

    const boundedTimeout = Math.min(Math.max(timeoutMs || 30000, 1000), 120000);
    let isTimeoutTriggered = false;

    const timeoutTimer = setTimeout(() => {
      isTimeoutTriggered = true;
      controller.abort(new Error(`Request timed out after ${boundedTimeout}ms`));
    }, boundedTimeout);

    const startTime = performance.now();

    try {
      const response = await fetch(parsedUrl.toString(), {
        method,
        headers: headerMap,
        body: requestBody,
        signal: controller.signal,
        redirect: "follow",
      });

      const durationMs = Math.round(performance.now() - startTime);
      const status = response.status;
      const statusText = response.statusText || getStandardStatusText(status);

      // Extract response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Stream / Read response buffer with bounding
      const arrayBuf = await response.arrayBuffer();
      const sizeBytes = arrayBuf.byteLength;
      let isTruncated = false;
      let targetBuffer = arrayBuf;

      if (sizeBytes > MAX_RESPONSE_BYTES) {
        targetBuffer = arrayBuf.slice(0, MAX_RESPONSE_BYTES);
        isTruncated = true;
      }

      const bodyText = new TextDecoder("utf-8").decode(targetBuffer);
      const contentType = response.headers.get("content-type") || "";
      const isJson =
        contentType.toLowerCase().includes("application/json") ||
        tryParseJson(bodyText);

      return {
        requestId,
        status,
        statusText,
        headers: responseHeaders,
        body: bodyText,
        durationMs,
        sizeBytes,
        isTruncated,
        isJson,
        contentType,
      };
    } catch (err: unknown) {
      const error = err as Error;

      if (controller.signal.aborted) {
        if (isTimeoutTriggered) {
          throw new Error(`Request timed out after ${boundedTimeout}ms`);
        }
        throw new Error("Request was cancelled");
      }

      // Check cause code if available
      const cause = (error as unknown as { cause?: { code?: string } })?.cause;
      const causeCode = cause?.code || "";

      if (causeCode === "ECONNREFUSED" || error.message.includes("ECONNREFUSED")) {
        throw new Error(
          `Connection refused: The target server at ${parsedUrl.host} is not responding. Ensure the service is running and accessible.`
        );
      }

      if (causeCode === "ENOTFOUND" || error.message.includes("ENOTFOUND")) {
        throw new Error(
          `DNS resolution failed: Host "${parsedUrl.hostname}" could not be found.`
        );
      }

      if (error.message.includes("fetch failed")) {
        throw new Error(
          `Network request failed to ${parsedUrl.origin}: ${error.message}`
        );
      }

      throw new Error(error.message || "Failed to execute HTTP request");
    } finally {
      clearTimeout(timeoutTimer);
      this.activeRequests.delete(requestId);
    }
  }
}

export const apiTesterService = new ApiTesterService();
