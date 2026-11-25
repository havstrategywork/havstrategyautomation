import { and, desc, eq } from "drizzle-orm";
import type { AnyDb } from "@/lib/access/db";
import * as schema from "@/lib/access/db/schema";

export async function listAuditLogs(db: AnyDb, organizationId: string, opts: { clientId?: string; limit?: number } = {}) {
  const conditions = [eq(schema.auditLogs.organizationId, organizationId)];
  if (opts.clientId) conditions.push(eq(schema.auditLogs.clientId, opts.clientId));

  return db
    .select()
    .from(schema.auditLogs)
    .where(and(...conditions))
    .orderBy(desc(schema.auditLogs.timestamp))
    .limit(Math.min(500, opts.limit ?? 100));
}
