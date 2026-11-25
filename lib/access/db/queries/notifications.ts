import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, type SQL } from "drizzle-orm";
import type { AnyDb } from "@/lib/access/db";
import * as schema from "@/lib/access/db/schema";
import type { NotificationChannel, NotificationType } from "@/lib/access/types";

/**
 * Scoped per-recipient (when one is given) so a fan-out to several agency
 * users never dedupes everyone after the first - without `recipientId` this
 * would otherwise treat "Raj was already notified" as "no one needs
 * notifying", silently dropping every other recipient's copy.
 */
export async function recentDuplicateExists(
  db: AnyDb,
  input: { clientId: string; notificationType: NotificationType; channel: NotificationChannel; withinMs: number; recipientId?: string | null },
) {
  const since = new Date(Date.now() - input.withinMs);
  const conditions: SQL[] = [
    eq(schema.notifications.clientId, input.clientId),
    eq(schema.notifications.notificationType, input.notificationType),
    eq(schema.notifications.channel, input.channel),
    gt(schema.notifications.createdAt, since),
  ];
  if (input.recipientId) conditions.push(eq(schema.notifications.recipientId, input.recipientId));
  else conditions.push(isNull(schema.notifications.recipientId));

  const rows = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(and(...conditions))
    .limit(1);
  return rows.length > 0;
}

export async function insertNotification(
  db: AnyDb,
  input: {
    organizationId: string;
    clientId?: string | null;
    recipientId?: string | null;
    recipientType: "agency_user" | "client";
    notificationType: NotificationType;
    channel: NotificationChannel;
    deliveryStatus: string;
    payload?: Record<string, unknown>;
  },
) {
  const id = randomUUID();
  await db.insert(schema.notifications).values({
    id,
    organizationId: input.organizationId,
    clientId: input.clientId ?? null,
    recipientId: input.recipientId ?? null,
    recipientType: input.recipientType,
    notificationType: input.notificationType,
    channel: input.channel,
    deliveryStatus: input.deliveryStatus,
    payload: input.payload ?? null,
  });
  return id;
}

export async function listNotificationsForUser(db: AnyDb, organizationId: string, recipientId: string, limit = 50) {
  return db
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.organizationId, organizationId), eq(schema.notifications.recipientId, recipientId)))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
}

export async function markNotificationRead(db: AnyDb, id: string, recipientId: string) {
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.recipientId, recipientId)));
}

export async function countUnread(db: AnyDb, organizationId: string, recipientId: string) {
  const rows = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.organizationId, organizationId),
        eq(schema.notifications.recipientId, recipientId),
        isNull(schema.notifications.readAt),
      ),
    );
  return rows.length;
}
