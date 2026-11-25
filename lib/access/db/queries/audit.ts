import type { Filter } from "mongodb";
import { NO_ID, type AnyDb } from "@/lib/access/db";
import type { AuditLog } from "@/lib/access/db/schema-types";

export async function listAuditLogs(db: AnyDb, organizationId: string, opts: { clientId?: string; limit?: number } = {}) {
  const filter: Filter<AuditLog> = { organizationId };
  if (opts.clientId) filter.clientId = opts.clientId;
  return db.auditLogs.find(filter, NO_ID).sort({ timestamp: -1 }).limit(Math.min(500, opts.limit ?? 100)).toArray();
}
