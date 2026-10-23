/**
 * Centralized DevDesk Frontend Environment Configuration
 *
 * Configured via .env (no .env.local).
 * Two variables for backend connection:
 *   - NEXT_PUBLIC_HOSTED_API_URL (e.g. "https://api.devdesk.yourdomain.com")
 *   - NEXT_PUBLIC_API_URL        (e.g. "http://localhost:5001")
 *
 * Logic: Hosted URL is used if provided, otherwise falls back to local API (OR evaluation: HOSTED || API).
 */

function normalizeUrl(url?: string): string {
  if (!url) return "";
  return url.trim().replace(/\/+$/, "");
}

// 1. Dual Backend URLs (Hosted and Local)
export const HOSTED_API_URL: string = normalizeUrl(
  process.env.NEXT_PUBLIC_HOSTED_API_URL ||
    process.env.HOSTED_API_URL ||
    process.env.NEXT_PUBLIC_HOSTED_BACKEND_URL ||
    process.env.HOSTED_BACKEND_URL ||
    ""
);

export const LOCAL_API_URL: string = normalizeUrl(
  process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_LOCAL_API_URL ||
    process.env.LOCAL_API_URL ||
    process.env.NEXT_PUBLIC_LOCAL_BACKEND_URL ||
    process.env.LOCAL_BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    "http://localhost:5001"
);

// Backward compatibility alias
export const LOCAL_BACKEND_URL = LOCAL_API_URL;
export const HOSTED_BACKEND_URL = HOSTED_API_URL;

// 2. Active Target URL: Hosted takes precedence via OR (||); falls back to Local API URL
export const BACKEND_URL: string = HOSTED_API_URL || LOCAL_API_URL || "http://localhost:5001";

// 3. REST API Base URL
export const API_BASE_URL: string = `${BACKEND_URL}/api`;

// 4. Whether active backend is remote/hosted or local
export const IS_HOSTED_BACKEND: boolean =
  Boolean(HOSTED_API_URL) ||
  !/^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(BACKEND_URL);

// 5. Clean display string for UI status bars and settings
export function getBackendDisplayLabel(): string {
  try {
    const parsed = new URL(BACKEND_URL);
    if (IS_HOSTED_BACKEND) {
      return `Hosted (${parsed.hostname})`;
    }
    return `Local (Port ${parsed.port || "5001"})`;
  } catch {
    return BACKEND_URL;
  }
}

export const APP_NAME: string = process.env.NEXT_PUBLIC_APP_NAME || "DevDesk";
export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0";
