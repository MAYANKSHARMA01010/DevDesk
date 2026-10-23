import { DiscoveredApiEndpoint } from "@/types/apiDiscovery";
import { HttpMethod, KeyValuePair } from "@/types/apiTester";

/**
 * Deterministic constant timestamp for sample payloads.
 * Using a fixed ISO string avoids Next.js server-client hydration mismatches.
 */
export const STATIC_SAMPLE_TIMESTAMP = "2026-10-23T12:00:00.000Z";

/**
 * Replaces dynamic route tokens (:id, :account_id, [id], etc.) in a URL with realistic sample values.
 */
export function resolveSampleUrl(rawPath: string, baseUrl: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");

  let resolved = rawPath.replace(/:([a-zA-Z0-9_]+)|\*([a-zA-Z0-9_]+)/g, (_, paramName, wildcard) => {
    const name = (paramName || wildcard || "").toLowerCase();
    if (name.includes("account")) return "acc_1024";
    if (name.includes("post")) return "post_5012";
    if (name.includes("video")) return "vid_9901";
    if (name.includes("project")) return "proj_7701";
    if (name.includes("user") || name.includes("member")) return "usr_8820";
    if (name.includes("job") || name.includes("task")) return "job_3310";
    if (name.includes("id")) return "1";
    return `sample_${name}`;
  });

  if (!resolved.startsWith("/")) resolved = "/" + resolved;
  return `${cleanBase}${resolved}`;
}

/**
 * Generates realistic query parameters for a route based on HTTP method and path keywords.
 */
export function generateRealisticQueryParams(
  method: HttpMethod,
  routePath: string,
  existingParams?: { name: string; sampleValue?: string }[]
): KeyValuePair[] {
  // If static analysis already found query parameters in the code, use them
  if (existingParams && existingParams.length > 0) {
    return existingParams.map((p, idx) => ({
      id: `p-sample-${idx + 1}`,
      key: p.name,
      value: p.sampleValue || (p.name.includes("id") ? "1" : "true"),
      enabled: true,
    }));
  }

  const lower = routePath.toLowerCase();

  if (lower.includes("account")) {
    return [
      { id: "p-sample-1", key: "status", value: "active", enabled: true },
      { id: "p-sample-2", key: "includeMetrics", value: "true", enabled: true },
      { id: "p-sample-3", key: "limit", value: "10", enabled: false },
    ];
  }

  if (lower.includes("video") || lower.includes("download")) {
    return [
      { id: "p-sample-1", key: "format", value: "mp4", enabled: true },
      { id: "p-sample-2", key: "quality", value: "1080p", enabled: true },
    ];
  }

  if (lower.includes("post")) {
    return [
      { id: "p-sample-1", key: "filter", value: "published", enabled: true },
      { id: "p-sample-2", key: "limit", value: "25", enabled: true },
      { id: "p-sample-3", key: "sort", value: "desc", enabled: true },
    ];
  }

  if (lower.includes("bulk")) {
    return [
      { id: "p-sample-1", key: "batchSize", value: "50", enabled: true },
      { id: "p-sample-2", key: "dryRun", value: "false", enabled: true },
    ];
  }

  if (lower.includes("me") || lower.includes("user")) {
    return [
      { id: "p-sample-1", key: "fields", value: "profile,email,settings", enabled: true },
    ];
  }

  if (lower.includes("health")) {
    return [
      { id: "p-sample-1", key: "verbose", value: "true", enabled: false },
    ];
  }

  // General GET endpoints default to pagination & sorting
  if (method === "GET") {
    return [
      { id: "p-sample-1", key: "page", value: "1", enabled: true },
      { id: "p-sample-2", key: "limit", value: "20", enabled: true },
      { id: "p-sample-3", key: "sort", value: "desc", enabled: false },
    ];
  }

  // Non-GET default
  return [
    { id: "p-sample-1", key: "notify", value: "true", enabled: false },
  ];
}

/**
 * Generates realistic request headers for a route, including Content-Type, Accept, and Auth.
 */
export function generateRealisticHeaders(
  routePath: string,
  existingHeaders?: { key: string; value: string }[]
): KeyValuePair[] {
  if (existingHeaders && existingHeaders.length > 0) {
    const list = existingHeaders.map((h, idx) => ({
      id: `h-sample-${idx + 1}`,
      key: h.key,
      value: h.value,
      enabled: true,
    }));

    // Ensure Content-Type & Accept are present
    if (!list.some((h) => h.key.toLowerCase() === "content-type")) {
      list.unshift({
        id: "h-sample-ct",
        key: "Content-Type",
        value: "application/json",
        enabled: true,
      });
    }
    return list;
  }

  const lower = routePath.toLowerCase();
  const headers: KeyValuePair[] = [
    {
      id: "h-sample-1",
      key: "Content-Type",
      value: "application/json",
      enabled: true,
    },
    {
      id: "h-sample-2",
      key: "Accept",
      value: "application/json",
      enabled: true,
    },
  ];

  // Protected / authenticated routes
  if (
    !lower.includes("health") &&
    !lower.includes("login") &&
    !lower.includes("register") &&
    !lower.includes("forgot-password")
  ) {
    headers.push({
      id: "h-sample-3",
      key: "Authorization",
      value: "Bearer devdesk_test_token_eyJhbGciOiJIUzI1NiJ9",
      enabled: true,
    });
  }

  return headers;
}

/**
 * Generates an intelligent, realistic request body example based on route keywords and method.
 */
export function generateRealisticRequestBody(
  method: HttpMethod,
  routePath: string,
  existingSample?: string
): string {
  if (!["POST", "PUT", "PATCH"].includes(method)) {
    return "";
  }

  // If existingSample is present and not just generic {"key": "value"}, use it
  if (existingSample && existingSample.trim().length > 0) {
    try {
      const parsed = JSON.parse(existingSample);
      const keys = Object.keys(parsed);
      if (!(keys.length === 1 && keys[0] === "key" && parsed["key"] === "value")) {
        return JSON.stringify(parsed, null, 2);
      }
    } catch {
      // ignore
    }
  }

  const lower = routePath.toLowerCase();

  if (lower.includes("account")) {
    return JSON.stringify(
      {
        name: "Acme Media Account",
        platform: "youtube",
        status: "active",
        settings: {
          autoUpload: true,
          notifications: true,
          defaultQuality: "1080p",
        },
      },
      null,
      2
    );
  }

  if (lower.includes("video") || lower.includes("download")) {
    return JSON.stringify(
      {
        videoUrl: "https://www.youtube.com/watch?v=sample123",
        title: "Automated Workflow Demo",
        resolution: "1080p",
        format: "mp4",
        autoPublish: true,
      },
      null,
      2
    );
  }

  if (lower.includes("post")) {
    return JSON.stringify(
      {
        title: "Announcing Developer Tools v2.0",
        caption: "Check out the latest features in DevDesk! #coding #developer #tools",
        scheduledTime: "2026-10-25T14:30:00Z",
        platforms: ["youtube", "twitter", "linkedin"],
        tags: ["devdesk", "automation", "tech"],
      },
      null,
      2
    );
  }

  if (lower.includes("login") || lower.includes("auth")) {
    return JSON.stringify(
      {
        email: "developer@example.com",
        password: "SuperSecretPassword123!",
      },
      null,
      2
    );
  }

  if (lower.includes("register") || lower.includes("signup")) {
    return JSON.stringify(
      {
        username: "dev_user",
        email: "developer@example.com",
        password: "SuperSecretPassword123!",
        role: "developer",
      },
      null,
      2
    );
  }

  if (lower.includes("forgot-password") || lower.includes("reset-password")) {
    return JSON.stringify(
      {
        email: "developer@example.com",
      },
      null,
      2
    );
  }

  if (lower.includes("bulk")) {
    return JSON.stringify(
      {
        action: "batch_process",
        ids: ["item_101", "item_102", "item_103"],
        options: {
          continueOnError: true,
          notifyOnComplete: true,
        },
      },
      null,
      2
    );
  }

  if (lower.includes("workspace") || lower.includes("scan")) {
    return JSON.stringify(
      {
        path: "/Users/developer/Projects/my-app",
      },
      null,
      2
    );
  }

  if (lower.includes("media") || lower.includes("upload")) {
    return JSON.stringify(
      {
        fileName: "showcase.mp4",
        mimeType: "video/mp4",
        sizeBytes: 15420100,
        tags: ["marketing", "promo"],
      },
      null,
      2
    );
  }

  // Fallback for general POST/PUT/PATCH
  return JSON.stringify(
    {
      name: "Sample Resource",
      status: "active",
      description: "Example request payload for testing this endpoint.",
    },
    null,
    2
  );
}

/**
 * Generates an intelligent, realistic expected response example based on route keywords and method.
 */
export function generateRealisticResponseExample(
  method: HttpMethod,
  routePath: string,
  existingSample?: string
): {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
} {
  // If an existing sample with non-trivial schema is available, use it
  if (existingSample && existingSample.trim().length > 0) {
    try {
      const parsed = JSON.parse(existingSample);
      if (Object.keys(parsed).length > 2 || (parsed.data && Object.keys(parsed.data).length > 0)) {
        return {
          statusCode: method === "POST" ? 201 : 200,
          statusText: method === "POST" ? "Created" : "OK",
          headers: {
            "content-type": "application/json; charset=utf-8",
            "x-response-time": "24ms",
          },
          body: JSON.stringify(parsed, null, 2),
        };
      }
    } catch {
      // ignore
    }
  }

  const lower = routePath.toLowerCase();

  if (method === "DELETE") {
    return {
      statusCode: 200,
      statusText: "OK",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-response-time": "18ms",
      },
      body: JSON.stringify(
        {
          success: true,
          message: "Resource deleted successfully.",
          deletedId: lower.includes("account")
            ? "acc_1024"
            : lower.includes("post")
            ? "post_5012"
            : lower.includes("video")
            ? "vid_9901"
            : "item_12345",
          deletedAt: STATIC_SAMPLE_TIMESTAMP,
        },
        null,
        2
      ),
    };
  }

  if (lower.includes("account")) {
    return {
      statusCode: 200,
      statusText: "OK",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-response-time": "28ms",
      },
      body: JSON.stringify(
        {
          success: true,
          message: method === "PATCH" ? "Account updated successfully." : "Account retrieved.",
          account: {
            id: "acc_1024",
            name: "Acme Media Account",
            platform: "youtube",
            status: "active",
            connectedAt: "2026-09-15T10:00:00.000Z",
            updatedAt: STATIC_SAMPLE_TIMESTAMP,
            metrics: {
              subscribers: 24500,
              totalViews: 1250000,
              activeUploads: 14,
            },
          },
        },
        null,
        2
      ),
    };
  }

  if (lower.includes("video") || lower.includes("download")) {
    return {
      statusCode: method === "POST" ? 201 : 200,
      statusText: method === "POST" ? "Created" : "OK",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-response-time": "45ms",
      },
      body: JSON.stringify(
        {
          success: true,
          video: {
            id: "vid_9901",
            title: "Automated Workflow Demo",
            duration: 184,
            resolution: "1080p",
            downloadUrl: "https://storage.example.com/videos/vid_9901.mp4",
            status: "ready",
            fileSizeBytes: 24510000,
            createdAt: STATIC_SAMPLE_TIMESTAMP,
          },
        },
        null,
        2
      ),
    };
  }

  if (lower.includes("post")) {
    return {
      statusCode: method === "POST" ? 201 : 200,
      statusText: method === "POST" ? "Created" : "OK",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-response-time": "32ms",
      },
      body: JSON.stringify(
        {
          success: true,
          post: {
            id: "post_5012",
            title: "Announcing Developer Tools v2.0",
            status: "published",
            platformsPublished: ["youtube", "twitter"],
            publishedAt: STATIC_SAMPLE_TIMESTAMP,
          },
        },
        null,
        2
      ),
    };
  }

  if (lower.includes("login") || lower.includes("auth")) {
    return {
      statusCode: 200,
      statusText: "OK",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-response-time": "20ms",
      },
      body: JSON.stringify(
        {
          success: true,
          token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfODgyMCIsImlhdCI6MTY3MjUzMzk5Mn0...",
          user: {
            id: "usr_8820",
            username: "dev_user",
            email: "developer@example.com",
            role: "developer",
          },
        },
        null,
        2
      ),
    };
  }

  if (lower.includes("register") || lower.includes("signup")) {
    return {
      statusCode: 201,
      statusText: "Created",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-response-time": "35ms",
      },
      body: JSON.stringify(
        {
          success: true,
          message: "User registered successfully.",
          user: {
            id: "usr_8820",
            username: "dev_user",
            email: "developer@example.com",
            role: "developer",
          },
        },
        null,
        2
      ),
    };
  }

  if (lower.includes("forgot-password") || lower.includes("reset-password")) {
    return {
      statusCode: 200,
      statusText: "OK",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-response-time": "15ms",
      },
      body: JSON.stringify(
        {
          success: true,
          message: "Password reset instructions sent to your email address.",
        },
        null,
        2
      ),
    };
  }

  if (lower.includes("me")) {
    return {
      statusCode: 200,
      statusText: "OK",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-response-time": "12ms",
      },
      body: JSON.stringify(
        {
          success: true,
          profile: {
            id: "usr_8820",
            name: "Mayank Sharma",
            email: "developer@example.com",
            role: "admin",
            permissions: ["projects:read", "projects:write", "terminal:exec"],
          },
        },
        null,
        2
      ),
    };
  }

  if (lower.includes("bulk")) {
    return {
      statusCode: 200,
      statusText: "OK",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-response-time": "60ms",
      },
      body: JSON.stringify(
        {
          success: true,
          processedCount: 3,
          items: [
            { id: "item_101", status: "completed" },
            { id: "item_102", status: "completed" },
            { id: "item_103", status: "completed" },
          ],
        },
        null,
        2
      ),
    };
  }

  if (lower.includes("health")) {
    return {
      statusCode: 200,
      statusText: "OK",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-response-time": "5ms",
      },
      body: JSON.stringify(
        {
          status: "ok",
          uptimeSeconds: 1420,
          timestamp: STATIC_SAMPLE_TIMESTAMP,
        },
        null,
        2
      ),
    };
  }

  // Default clean response
  return {
    statusCode: method === "POST" ? 201 : 200,
    statusText: method === "POST" ? "Created" : "OK",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-response-time": "22ms",
    },
    body: JSON.stringify(
      {
        success: true,
        statusCode: method === "POST" ? 201 : 200,
        message: "Request processed successfully.",
        data: {
          id: "item_1001",
          createdAt: STATIC_SAMPLE_TIMESTAMP,
        },
      },
      null,
      2
    ),
  };
}

/**
 * Returns a complete end-to-end example for any endpoint:
 * URL with sample path params, example query params, headers, body, and expected response.
 */
export interface CompleteApiExample {
  url: string;
  method: HttpMethod;
  params: KeyValuePair[];
  headers: KeyValuePair[];
  body: string;
  response: {
    statusCode: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
  };
}

export function generateCompleteApiExample(
  method: HttpMethod,
  rawPath: string,
  baseUrl: string,
  endpoint?: DiscoveredApiEndpoint
): CompleteApiExample {
  const url = resolveSampleUrl(rawPath, baseUrl);
  const params = generateRealisticQueryParams(method, rawPath, endpoint?.queryParams);
  const headers = generateRealisticHeaders(rawPath, endpoint?.headers);
  const body = generateRealisticRequestBody(method, rawPath, endpoint?.requestBody?.sampleJson);
  const response = generateRealisticResponseExample(
    method,
    rawPath,
    endpoint?.responses?.[0]?.sampleJson
  );

  return {
    url,
    method,
    params,
    headers,
    body,
    response,
  };
}
