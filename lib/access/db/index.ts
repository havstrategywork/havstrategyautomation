import type { Collection, Db, FindOptions } from "mongodb";
import { mongoDb } from "@/lib/db";
import type {
  AccessRequest, AgencyCredential, AnalyticsEvent, AuditLog, Client, ConnectedAsset, EncryptedCredential, Notification, OnboardingInvitation, Organization, PlatformConnection,
} from "./schema-types";

/**
 * The Access Hub keeps its data in the same MongoDB as the rest of the app, in its own hub_* collections (no second database to run or pay for).
 * Every query helper in lib/access/db/queries takes this handle.
 */
export interface HubDb {
  organizations: Collection<Organization>;
  clients: Collection<Client>;
  invitations: Collection<OnboardingInvitation>;
  connections: Collection<PlatformConnection>;
  assets: Collection<ConnectedAsset>;
  accessRequests: Collection<AccessRequest>;
  credentials: Collection<EncryptedCredential>;
  auditLogs: Collection<AuditLog>;
  notifications: Collection<Notification>;
  analytics: Collection<AnalyticsEvent>;
  agencyCredentials: Collection<AgencyCredential>;
}
export type AnyDb = HubDb;
export type GetDbResult = { ok: true; db: HubDb } | { ok: false; error: string };

const g = globalThis as unknown as { __hubIdx?: Promise<unknown> };

async function setupIndexes(d: Db) {
  await Promise.all([
    d.collection("hub_clients").createIndex({ id: 1 }, { unique: true }),
    d.collection("hub_clients").createIndex({ organizationId: 1, createdAt: -1 }),
    d.collection("hub_invitations").createIndex({ id: 1 }, { unique: true }),
    d.collection("hub_invitations").createIndex({ tokenHash: 1 }, { unique: true }),
    d.collection("hub_invitations").createIndex({ clientId: 1 }),
    d.collection("hub_connections").createIndex({ id: 1 }, { unique: true }),
    d.collection("hub_connections").createIndex({ clientId: 1, platform: 1 }, { unique: true }),
    d.collection("hub_assets").createIndex({ id: 1 }, { unique: true }),
    d.collection("hub_assets").createIndex({ connectionId: 1, externalAssetId: 1 }, { unique: true }),
    d.collection("hub_access_requests").createIndex({ connectionId: 1 }),
    d.collection("hub_credentials").createIndex({ connectionId: 1 }, { unique: true }),
    d.collection("hub_audit_logs").createIndex({ organizationId: 1, timestamp: -1 }),
    d.collection("hub_notifications").createIndex({ organizationId: 1, recipientId: 1, createdAt: -1 }),
    d.collection("hub_analytics").createIndex({ organizationId: 1, eventType: 1 }),
    d.collection("hub_agency_credentials").createIndex({ provider: 1 }, { unique: true }),
  ]);
}

export async function getDb(): Promise<GetDbResult> {
  if (!process.env.MONGODB_URI) return { ok: false, error: "MONGODB_URI is not configured." };
  try {
    const d = await mongoDb();
    await (g.__hubIdx ??= setupIndexes(d).catch((e) => { g.__hubIdx = undefined; throw e; }));
    return {
      ok: true,
      db: {
        organizations: d.collection<Organization>("hub_organizations"),
        clients: d.collection<Client>("hub_clients"),
        invitations: d.collection<OnboardingInvitation>("hub_invitations"),
        connections: d.collection<PlatformConnection>("hub_connections"),
        assets: d.collection<ConnectedAsset>("hub_assets"),
        accessRequests: d.collection<AccessRequest>("hub_access_requests"),
        credentials: d.collection<EncryptedCredential>("hub_credentials"),
        auditLogs: d.collection<AuditLog>("hub_audit_logs"),
        notifications: d.collection<Notification>("hub_notifications"),
        analytics: d.collection<AnalyticsEvent>("hub_analytics"),
        agencyCredentials: d.collection<AgencyCredential>("hub_agency_credentials"),
      },
    };
  } catch (e) {
    return { ok: false, error: `Could not reach MongoDB (${e instanceof Error ? e.message : "unknown error"}).` };
  }
}

/** Reads never expose Mongo's own _id. */
export const NO_ID = { projection: { _id: 0 } } as const satisfies FindOptions;
