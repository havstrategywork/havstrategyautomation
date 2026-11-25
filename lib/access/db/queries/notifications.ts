import { randomUUID } from "node:crypto";
import type { Filter } from "mongodb";
import { NO_ID, type AnyDb } from "@/lib/access/db";
import type { Notification } from "@/lib/access/db/schema-types";
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
  const filter: Filter<Notification> = {
    clientId: input.clientId,
    notificationType: input.notificationType,
    channel: input.channel,
    createdAt: { $gt: new Date(Date.now() - input.withinMs) },
    recipientId: input.recipientId ?? null,
  };
  return (await db.notifications.countDocuments(filter, { limit: 1 })) > 0;
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
  await db.notifications.insertOne({
    id,
    organizationId: input.organizationId,
    clientId: input.clientId ?? null,
    recipientId: input.recipientId ?? null,
    recipientType: input.recipientType,
    notificationType: input.notificationType,
    channel: input.channel,
    deliveryStatus: input.deliveryStatus,
    payload: input.payload ?? null,
    readAt: null,
    createdAt: new Date(),
  });
  return id;
}

export async function listNotificationsForUser(db: AnyDb, organizationId: string, recipientId: string, limit = 50) {
  return db.notifications.find({ organizationId, recipientId }, NO_ID).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function markNotificationRead(db: AnyDb, id: string, recipientId: string) {
  await db.notifications.updateOne({ id, recipientId }, { $set: { readAt: new Date() } });
}

export async function countUnread(db: AnyDb, organizationId: string, recipientId: string) {
  return db.notifications.countDocuments({ organizationId, recipientId, readAt: null });
}
