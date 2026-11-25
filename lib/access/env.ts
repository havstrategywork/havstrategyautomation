import { z } from "zod";

/**
 * Central place that decides demo vs. production and exposes typed,
 * lazily-validated access to every env var. Nothing here throws at import
 * time - a missing production credential is only ever a problem for the
 * specific feature that needs it (see lib/integrations/registry.ts and the
 * "fails safely" requirement in the spec), never a crash of the whole app.
 */

export type AppMode = "demo" | "production";

export function getAppMode(): AppMode {
  // Demo mode keeps an embedded database on local disk, which cannot exist on Vercel (read-only, no persistence), so a hosted deploy is always
  // production unless someone explicitly forces demo. (Production without DATABASE_URL shows a clear "database unavailable" message.)
  if (process.env.APP_MODE === "demo") return "demo";
  return process.env.APP_MODE === "production" || process.env.VERCEL ? "production" : "demo";
}

export function isDemoMode(): boolean {
  return getAppMode() === "demo";
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000";
}

/** Non-secret, safe to read anywhere. Secrets below are intentionally not cached at module scope. */
const envSchema = z.object({
  APP_MODE: z.enum(["demo", "production"]).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  TOKEN_ENCRYPTION_KEY_REFERENCE: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_LOGIN_CONFIG_ID: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().optional(),
  META_AGENCY_BUSINESS_ID: z.string().optional(),
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
  GOOGLE_ADS_MANAGER_CUSTOMER_ID: z.string().optional(),
  GOOGLE_ADS_API_VERSION: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().optional(),
  NOTIFY_URL: z.string().optional(),
});

export function readEnv() {
  return envSchema.parse(process.env);
}

/**
 * A secret that is safe to synthesize a random, process-local value for in
 * demo mode (so local dev never needs any setup) but MUST be explicitly
 * configured in production. Returns { ok: true, value } or
 * { ok: false, error } - callers decide how to fail (never a crash).
 */
export function requireProductionSecret(
  name: string,
  value: string | undefined,
): { ok: true; value: string } | { ok: false; error: string } {
  if (value && value.trim().length > 0) return { ok: true, value };
  if (isDemoMode()) {
    // Deterministic-enough per process, never persisted, never used for
    // anything beyond making local demo dev work without a .env file.
    return { ok: true, value: `demo-insecure-${name.toLowerCase()}-secret` };
  }
  return { ok: false, error: `${name} is not configured. Set it in your production environment.` };
}
