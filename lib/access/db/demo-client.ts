import path from "node:path";
import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";
import { seedDemoData } from "./seed-demo";

/**
 * Demo mode's database: a real embedded Postgres (PGlite, Postgres compiled
 * to WASM) persisted to a local directory. Same schema and same migrations
 * as production - the only thing that differs between modes is which
 * Drizzle driver/connection is used. No external service, Docker container
 * or account is required, which is what makes "npm install && npm run dev"
 * fully functional with zero configuration.
 *
 * Stashed on globalThis so Next.js dev-mode module reloads (Fast Refresh)
 * reuse the same in-process database instead of trying to open the on-disk
 * store twice.
 */

type DemoDb = ReturnType<typeof drizzle<typeof schema>>;

const globalForDemoDb = globalThis as unknown as {
  __accesshubDemoDb?: Promise<DemoDb>;
};

async function initDemoDb(): Promise<DemoDb> {
  const dataDir = path.join(process.cwd(), ".data", "demo-db");
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: path.join(process.cwd(), "access-hub", "drizzle") });
  await seedDemoData(db);

  return db;
}

export function getDemoDb(): Promise<DemoDb> {
  if (!globalForDemoDb.__accesshubDemoDb) {
    globalForDemoDb.__accesshubDemoDb = initDemoDb().catch((e) => { globalForDemoDb.__accesshubDemoDb = undefined; throw e; }); // a failed start is retried, not cached
  }
  return globalForDemoDb.__accesshubDemoDb;
}

/** Wipes and recreates the demo database from scratch. Used by scripts/reset-demo.ts. */
export async function resetDemoDatabase(): Promise<void> {
  const fs = await import("node:fs/promises");
  const dataDir = path.join(process.cwd(), ".data", "demo-db");
  await fs.rm(dataDir, { recursive: true, force: true });
  globalForDemoDb.__accesshubDemoDb = undefined;
  await getDemoDb();
}
