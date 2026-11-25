import { randomUUID } from "node:crypto";
import type { AnyDb } from "@/lib/access/db";
import * as schema from "@/lib/access/db/schema";
import type { ActorType, AnalyticsEventType } from "@/lib/access/types";

/**
 * Writes an audit log row. `metadata` must already be sanitized by the
 * caller - never pass a token, authorization code or full credential
 * object here (see section 15 "Never ... log access tokens or auth codes").
 */
export async function logAudit(
  db: AnyDb,
  input: {
    organizationId: string;
    clientId?: string | null;
    actorId?: string | null;
    actorType: ActorType;
    action: string;
    platform?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(schema.auditLogs).values({
    id: randomUUID(),
    organizationId: input.organizationId,
    clientId: input.clientId ?? null,
    actorId: input.actorId ?? null,
    actorType: input.actorType,
    action: input.action,
    platform: input.platform ?? null,
    sanitizedMetadata: input.metadata ?? null,
  });
}

/** Privacy-conscious product analytics (section 19) - never PII or tokens. */
export async function trackEvent(
  db: AnyDb,
  input: { organizationId: string; clientId?: string | null; eventType: AnalyticsEventType; platform?: string | null; metadata?: Record<string, unknown> },
) {
  await db.insert(schema.analyticsEvents).values({
    id: randomUUID(),
    organizationId: input.organizationId,
    clientId: input.clientId ?? null,
    eventType: input.eventType,
    platform: input.platform ?? null,
    metadata: input.metadata ?? {},
  });
}
