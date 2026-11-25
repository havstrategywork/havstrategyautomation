import { getAppUrl } from "@/lib/access/env";

/**
 * Origin-check CSRF protection for same-origin, cookie-authenticated
 * mutating requests. All of this app's state-changing endpoints are called
 * only by its own frontend, so a mismatched/missing Origin on a
 * POST/PUT/PATCH/DELETE is always a forgery attempt or a misconfigured
 * client - never a legitimate use case to special-case.
 */
export function isTrustedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  // Same-origin browser navigations/fetches always send Origin on mutating
  // requests; a same-origin request missing it entirely (some non-browser
  // clients) is allowed only when there's also no Origin AND no Referer
  // cross-site mismatch - but to keep this unambiguous we simply require it.
  if (!origin) return false;

  let appOrigin: string;
  try {
    appOrigin = new URL(getAppUrl()).origin;
  } catch {
    return false;
  }

  if (origin === appOrigin) return true;

  // Allow the request's own host (handles previews/deployments where
  // NEXT_PUBLIC_APP_URL lags the actual serving domain) as long as the
  // scheme+host matches what the request itself was served on.
  const requestOrigin = new URL(req.url).origin;
  return origin === requestOrigin;
}

export const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
