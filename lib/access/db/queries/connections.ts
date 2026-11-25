import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import type { AnyDb } from "@/lib/access/db";
import * as schema from "@/lib/access/db/schema";
import type {
  AgencyAccessStatus,
  AssetSelectionStatus,
  ConnectionHealth,
  DisplayConnectionStatus,
  OAuthAuthorizationStatus,
  TokenValidityStatus,
} from "@/lib/access/types";

export async function getConnection(db: AnyDb, clientId: string, platform: string) {
  const rows = await db
    .select()
    .from(schema.platformConnections)
    .where(and(eq(schema.platformConnections.clientId, clientId), eq(schema.platformConnections.platform, platform)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listConnectionsForClient(db: AnyDb, clientId: string) {
  return db.select().from(schema.platformConnections).where(eq(schema.platformConnections.clientId, clientId));
}

/** Every connection that has an active application authorization and is therefore worth periodically re-checking. */
export async function listActiveConnections(db: AnyDb) {
  return db.select().from(schema.platformConnections).where(eq(schema.platformConnections.oauthAuthorizationStatus, "application_authorized"));
}

/** Org-wide remediation view (Access Management page) - every connection whose health isn't "healthy", with its client. */
export async function listConnectionsNeedingAttention(db: AnyDb, organizationId: string) {
  return db
    .select({ connection: schema.platformConnections, client: schema.clients })
    .from(schema.platformConnections)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.platformConnections.clientId))
    .where(and(eq(schema.platformConnections.organizationId, organizationId), ne(schema.platformConnections.connectionHealth, "healthy")));
}

/** Creates the connection row the moment an invitation requesting this platform is generated (status: invitation_sent). */
export async function ensureConnectionShell(db: AnyDb, input: { organizationId: string; clientId: string; platform: string }) {
  const existing = await getConnection(db, input.clientId, input.platform);
  if (existing) return existing;

  const id = randomUUID();
  await db.insert(schema.platformConnections).values({
    id,
    organizationId: input.organizationId,
    clientId: input.clientId,
    platform: input.platform,
    oauthAuthorizationStatus: "invitation_sent",
  });
  return getConnection(db, input.clientId, input.platform);
}

export async function updateConnectionStatus(
  db: AnyDb,
  connectionId: string,
  patch: Partial<{
    providerUserId: string | null;
    oauthAuthorizationStatus: OAuthAuthorizationStatus;
    tokenValidityStatus: TokenValidityStatus;
    assetSelectionStatus: AssetSelectionStatus;
    agencyAccessStatus: AgencyAccessStatus;
    grantedScopes: string[];
    tokenReference: string | null;
    tokenExpiry: Date | null;
    lastVerifiedAt: Date | null;
    connectionHealth: ConnectionHealth;
    errorMessage: string | null;
  }>,
) {
  const [row] = await db
    .update(schema.platformConnections)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.platformConnections.id, connectionId))
    .returning();
  return row ?? null;
}

export async function getConnectionById(db: AnyDb, connectionId: string) {
  const rows = await db.select().from(schema.platformConnections).where(eq(schema.platformConnections.id, connectionId)).limit(1);
  return rows[0] ?? null;
}

// --- Assets -----------------------------------------------------------

export async function listAssetsForConnection(db: AnyDb, connectionId: string) {
  return db.select().from(schema.connectedAssets).where(eq(schema.connectedAssets.connectionId, connectionId));
}

export async function replaceSelectedAssets(
  db: AnyDb,
  connectionId: string,
  assets: { externalAssetId: string; assetName: string; assetType: string; grantedPermissions: string[] }[],
) {
  await db.delete(schema.connectedAssets).where(eq(schema.connectedAssets.connectionId, connectionId));
  if (assets.length === 0) return [];
  const rows = assets.map((a) => ({
    id: randomUUID(),
    connectionId,
    externalAssetId: a.externalAssetId,
    assetName: a.assetName,
    assetType: a.assetType,
    grantedPermissions: a.grantedPermissions,
    verificationStatus: "selected" as const,
    selectedAt: new Date(),
  }));
  await db.insert(schema.connectedAssets).values(rows);
  return rows;
}

export async function updateAssetVerification(db: AnyDb, assetId: string, status: string, verifiedAt?: Date) {
  await db
    .update(schema.connectedAssets)
    .set({ verificationStatus: status, verifiedAt: verifiedAt ?? null })
    .where(eq(schema.connectedAssets.id, assetId));
}

// --- Access requests ----------------------------------------------------

export async function createAccessRequest(
  db: AnyDb,
  input: { connectionId: string; assetId?: string | null; externalRequestId?: string | null; requestedPermissions: string[]; requestStatus: string },
) {
  const id = randomUUID();
  await db.insert(schema.accessRequests).values({
    id,
    connectionId: input.connectionId,
    assetId: input.assetId ?? null,
    externalRequestId: input.externalRequestId ?? null,
    requestedPermissions: input.requestedPermissions,
    requestStatus: input.requestStatus,
    approvedAt: input.requestStatus === "approved" ? new Date() : null,
  });
  return id;
}

export async function listAccessRequestsForConnection(db: AnyDb, connectionId: string) {
  return db.select().from(schema.accessRequests).where(eq(schema.accessRequests.connectionId, connectionId));
}

// --- Credentials (privileged only - never return these from a route handler) ---

export async function upsertCredentials(
  db: AnyDb,
  connectionId: string,
  input: { encryptedAccessToken: string | null; encryptedRefreshToken: string | null; expiresAt: Date | null },
) {
  const existing = await db.select().from(schema.encryptedCredentials).where(eq(schema.encryptedCredentials.connectionId, connectionId)).limit(1);
  if (existing[0]) {
    await db
      .update(schema.encryptedCredentials)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.encryptedCredentials.connectionId, connectionId));
    return existing[0].id;
  }
  const id = randomUUID();
  await db.insert(schema.encryptedCredentials).values({ id, connectionId, ...input });
  await db.update(schema.platformConnections).set({ tokenReference: id }).where(eq(schema.platformConnections.id, connectionId));
  return id;
}

export async function getCredentials(db: AnyDb, connectionId: string) {
  const rows = await db.select().from(schema.encryptedCredentials).where(eq(schema.encryptedCredentials.connectionId, connectionId)).limit(1);
  return rows[0] ?? null;
}

export async function deleteCredentials(db: AnyDb, connectionId: string) {
  await db.delete(schema.encryptedCredentials).where(eq(schema.encryptedCredentials.connectionId, connectionId));
}

/**
 * Combines the four independently-tracked status fields (section 7) into
 * the single display status the UI shows as one badge. Always derived,
 * never stored, so the four underlying fields stay the real source of truth.
 */
export function toDisplayStatus(conn: {
  oauthAuthorizationStatus: string;
  tokenValidityStatus: string;
  assetSelectionStatus: string;
  agencyAccessStatus: string;
}): DisplayConnectionStatus {
  const { oauthAuthorizationStatus: oauth, assetSelectionStatus: assets, agencyAccessStatus: agency, tokenValidityStatus: token } = conn;

  if (oauth === "not_requested") return "not_requested";
  if (oauth === "invitation_sent") return "invitation_sent";
  if (oauth === "authorization_started") return "authorization_started";
  if (oauth === "authorization_denied") return "authorization_denied";
  if (oauth === "access_revoked" || agency === "revoked") return "access_revoked";
  if (oauth === "authorization_expired" || token === "expired") return "authorization_expired";
  if (oauth === "integration_error") return "integration_error";

  if (oauth === "application_authorized") {
    if (assets === "asset_selection_required") return "asset_selection_required";
    if (agency === "agency_approval_pending") return "agency_approval_pending";
    if (agency === "insufficient_permissions") return "insufficient_permissions";
    if (agency === "denied") return "insufficient_permissions";
    if (agency === "granted" && assets === "completed") return "connected_and_verified";
    if (assets === "completed" && agency !== "not_applicable") return "partially_connected";
    return "application_authorized";
  }

  return "disconnected";
}
