import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

/**
 * Production database connection (real Postgres / Supabase). Lazily
 * created and memoized on globalThis so Next.js dev-mode module reloads
 * don't leak connections. Never throws at import time - callers must use
 * getProductionDb(), which returns a Result so a missing DATABASE_URL in
 * production surfaces as a clean, specific error instead of crashing the
 * process or (worse) silently falling back to demo data.
 */

type ProdDb = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __accesshubSql?: postgres.Sql;
  __accesshubDb?: ProdDb;
};

export type DbResult = { ok: true; db: ProdDb } | { ok: false; error: string };

export function getProductionDb(): DbResult {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim().length === 0) {
    return {
      ok: false,
      error:
        "DATABASE_URL is not configured. Production mode requires a real Postgres connection string (see .env.example).",
    };
  }

  if (!globalForDb.__accesshubDb) {
    globalForDb.__accesshubSql = postgres(url, { max: 10 });
    globalForDb.__accesshubDb = drizzle(globalForDb.__accesshubSql, { schema });
  }

  return { ok: true, db: globalForDb.__accesshubDb };
}

/**
 * Runs `fn` inside a transaction with the `app.current_org_id` session GUC
 * set, so the Postgres row-level-security policies in supabase/rls.sql are
 * actually live for every query `fn` issues (not just the ones the
 * application layer remembers to filter itself). See rls.sql for the model.
 */
export async function withOrgContext<T>(
  db: ProdDb,
  organizationId: string,
  fn: (tx: ProdDb) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_org_id', ${organizationId}, true)`);
    return fn(tx as unknown as ProdDb);
  });
}
