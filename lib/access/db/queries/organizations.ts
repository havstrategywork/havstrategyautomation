import { eq } from "drizzle-orm";
import type { AnyDb } from "@/lib/access/db";
import * as schema from "@/lib/access/db/schema";

export async function getOrganizationById(db: AnyDb, organizationId: string) {
  const rows = await db.select().from(schema.organizations).where(eq(schema.organizations.id, organizationId)).limit(1);
  return rows[0] ?? null;
}

export async function updateOrganizationBranding(
  db: AnyDb,
  organizationId: string,
  patch: { organizationName?: string; logoUrl?: string | null; settings?: Record<string, unknown> },
) {
  const [row] = await db
    .update(schema.organizations)
    .set(patch)
    .where(eq(schema.organizations.id, organizationId))
    .returning();
  return row ?? null;
}
