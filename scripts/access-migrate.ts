#!/usr/bin/env tsx
/**
 * Applies Drizzle schema migrations to a real Postgres/Supabase database,
 * then the hand-written RLS policies in supabase/rls.sql. Run with:
 *   DATABASE_URL=postgres://... npx tsx scripts/access-migrate.ts
 * (or `npm run db:migrate` once DATABASE_URL is set in .env.local)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to .env.local or pass it inline.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);

  console.log("Applying schema migrations...");
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "access-hub", "drizzle") });
  console.log("Schema migrations applied.");

  console.log("Applying row-level security policies...");
  const rlsSql = readFileSync(path.join(process.cwd(), "access-hub", "supabase", "rls.sql"), "utf8");
  await sql.unsafe(rlsSql);
  console.log("RLS policies applied.");

  await sql.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
