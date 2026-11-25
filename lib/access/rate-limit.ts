/**
 * In-memory fixed-window rate limiter. Sufficient for a single-instance MVP
 * deployment; a multi-instance production deployment should swap this for a
 * shared store (e.g. Redis/Upstash) - the call sites (login, public
 * onboarding endpoints) are already isolated behind this one function so
 * that swap touches only this file.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

// Periodically forget stale buckets so this never grows unbounded in a
// long-running process.
const MAX_BUCKETS = 50_000;

export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size > MAX_BUCKETS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return { allowed, remaining: Math.max(0, limit - existing.count) };
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
