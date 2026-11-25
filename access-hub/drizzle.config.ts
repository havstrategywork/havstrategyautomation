import type { Config } from "drizzle-kit";

// Used only for generating/applying migrations against a REAL Postgres
// instance (production). Demo mode's embedded PGlite database is migrated
// programmatically at startup - see lib/db/demo-client.ts.
export default {
  schema: "./lib/access/db/schema.ts",
  out: "./access-hub/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://placeholder/placeholder",
  },
} satisfies Config;
