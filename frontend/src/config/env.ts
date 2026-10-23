/**
 * Centralized DevDesk Frontend Environment Configuration
 *
 * Change NEXT_PUBLIC_BACKEND_URL in your .env or .env.local to update
 * the target backend link everywhere in the application with a single change.
 */

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

// Target backend URL (e.g. "http://localhost:5001" or hosted "https://api.devdesk.mydomain.com")
export const BACKEND_URL: string = normalizeUrl(
  process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:5001"
);

// REST API Base URL
export const API_BASE_URL: string = `${BACKEND_URL}/api`;

// Whether backend is remote/hosted or local
export const IS_HOSTED_BACKEND: boolean = !/^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(
  BACKEND_URL
);

// Clean display string for UI status bars and settings
export function getBackendDisplayLabel(): string {
  try {
    const parsed = new URL(BACKEND_URL);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return `Port ${parsed.port || "5001"}`;
    }
    return `Hosted (${parsed.hostname})`;
  } catch {
    return BACKEND_URL;
  }
}

export const APP_NAME: string = process.env.NEXT_PUBLIC_APP_NAME || "DevDesk";
export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0";
