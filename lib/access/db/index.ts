import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getAppMode } from "@/lib/access/env";
import { getDemoDb } from "./demo-client";
import { getProductionDb } from "./client";
import * as schema from "./schema";

/**
 * Structural type shared by both drivers (PGlite for demo, postgres-js for
 * production) - both are concrete `PgDatabase<...>` instances over the same
 * schema, so every query/mutation helper in lib/db/queries/* is written
 * once against this type and works unmodified in either mode.
 */
export type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export type GetDbResult = { ok: true; db: AnyDb } | { ok: false; error: string };

export async function getDb(): Promise<GetDbResult> {
  if (getAppMode() === "demo") {
    try {
      const db = await getDemoDb();
      return { ok: true, db: db as unknown as AnyDb };
    } catch (e) {
      // e.g. a read-only disk: report it instead of crashing the page
      return { ok: false, error: `The embedded demo database could not start (${e instanceof Error ? e.message : "unknown error"}). Set APP_MODE=production and DATABASE_URL.` };
    }
  }
  const result = getProductionDb();
  if (!result.ok) return result;
  return { ok: true, db: result.db as unknown as AnyDb };
}
