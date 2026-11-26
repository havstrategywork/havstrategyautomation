import { randomUUID } from "node:crypto";
import { NO_ID, type AnyDb } from "@/lib/access/db";
import type { Client, PlatformConnection } from "@/lib/access/db/schema-types";
import type {
  AgencyAccessStatus,
  AssetSelectionStatus,
  ConnectionHealth,
  DisplayConnectionStatus,
  OAuthAuthorizationStatus,
  TokenValidityStatus,
} from "@/lib/access/types";

export async function getConnection(db: AnyDb, clientId: string, platform: string) {
  return db.connections.findOne({ clientId, platform }, NO_ID);
}

export async function listConnectionsForClient(db: AnyDb, clientId: string) {
  return db.connections.find({ clientId }, NO_ID).toArray();
}

/** Every connection that has an active application authorization and is therefore worth periodically re-checking. */
export async function listActiveConnections(db: AnyDb) {
  return db.connections.find({ oauthAuthorizationStatus: "application_authorized" }, NO_ID).toArray();
}

/** Org-wide remediation view (Access Management page) - every connection whose health isn't "healthy", with its client. */
export async function listConnectionsNeedingAttention(db: AnyDb, organizationId: string): Promise<{ connection: PlatformConnection; client: Client }[]> {
  const connections = await db.connections.find({ organizationId, connectionHealth: { $ne: "healthy" } }, NO_ID).toArray();
  if (!connections.length) return [];
  const clients = await db.clients.find({ id: { $in: [...new Set(connections.map((c) => c.clientId))] } }, NO_ID).toArray();
  const byId = new Map(clients.map((c) => [c.id, c]));
  return connections.flatMap((connection) => {
    const client = byId.get(connection.clientId);
    return client ? [{ connection, client }] : [];
  });
}

/** Creates the connection row the moment an invitation requesting this platform is generated (status: invitation_sent). */
export async function ensureConnectionShell(db: AnyDb, input: { organizationId: string; clientId: string; platform: string }) {
  const existing = await getConnection(db, input.clientId, input.platform);
  if (existing) return existing;

  const now = new Date();
  try {
    await db.connections.insertOne({
      id: randomUUID(),
      organizationId: input.organizationId,
      clientId: input.clientId,
      platform: input.platform,
      providerUserId: null,
      oauthAuthorizationStatus: "invitation_sent",
      tokenValidityStatus: "not_applicable",
      assetSelectionStatus: "not_required",
      agencyAccessStatus: "not_applicable",
      grantedScopes: [],
      tokenReference: null,
      tokenExpiry: null,
      lastVerifiedAt: null,
      connectionHealth: "healthy",
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e; // two requests raced: the unique (client, platform) index keeps one
  }
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
  const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  return db.connections.findOneAndUpdate({ id: connectionId }, { $set: { ...set, updatedAt: new Date() } }, { returnDocument: "after", ...NO_ID });
}

export async function getConnectionById(db: AnyDb, connectionId: string) {
  return db.connections.findOne({ id: connectionId }, NO_ID);
}

// --- Assets -----------------------------------------------------------

export async function listAssetsForConnection(db: AnyDb, connectionId: string) {
  return db.assets.find({ connectionId }, NO_ID).toArray();
}

export async function replaceSelectedAssets(
  db: AnyDb,
  connectionId: string,
  assets: { externalAssetId: string; assetName: string; assetType: string; grantedPermissions: string[] }[],
) {
  await db.assets.deleteMany({ connectionId });
  if (assets.length === 0) return [];
  const now = new Date();
  const rows = assets.map((a) => ({
    id: randomUUID(),
    connectionId,
    externalAssetId: a.externalAssetId,
    assetName: a.assetName,
    assetType: a.assetType,
    grantedPermissions: a.grantedPermissions,
    verificationStatus: "selected",
    selectedAt: now,
    verifiedAt: null,
    createdAt: now,
  }));
  await db.assets.insertMany(rows.map((r) => ({ ...r })));
  return rows;
}

export async function updateAssetVerification(db: AnyDb, assetId: string, status: string, verifiedAt?: Date) {
  await db.assets.updateOne({ id: assetId }, { $set: { verificationStatus: status, verifiedAt: verifiedAt ?? null } });
}

// --- Access requests ----------------------------------------------------

export async function createAccessRequest(
  db: AnyDb,
  input: { connectionId: string; assetId?: string | null; externalRequestId?: string | null; requestedPermissions: string[]; requestStatus: string },
) {
  const id = randomUUID();
  await db.accessRequests.insertOne({
    id,
    connectionId: input.connectionId,
    assetId: input.assetId ?? null,
    externalRequestId: input.externalRequestId ?? null,
    requestedPermissions: input.requestedPermissions,
    requestStatus: input.requestStatus,
    approvedAt: input.requestStatus === "approved" ? new Date() : null,
    createdAt: new Date(),
  });
  return id;
}

export async function listAccessRequestsForConnection(db: AnyDb, connectionId: string) {
  return db.accessRequests.find({ connectionId }, NO_ID).toArray();
}

// --- Credentials (privileged only - never return these from a route handler) ---

export async function upsertCredentials(
  db: AnyDb,
  connectionId: string,
  input: { encryptedAccessToken: string | null; encryptedRefreshToken: string | null; expiresAt: Date | null },
) {
  const existing = await db.credentials.findOne({ connectionId }, NO_ID);
  if (existing) {
    await db.credentials.updateOne({ connectionId }, { $set: { ...input, updatedAt: new Date() } });
    return existing.id;
  }
  const id = randomUUID();
  const now = new Date();
  await db.credentials.insertOne({ id, connectionId, ...input, encryptionKeyVersion: 1, createdAt: now, updatedAt: now });
  await db.connections.updateOne({ id: connectionId }, { $set: { tokenReference: id } });
  return id;
}

export async function getCredentials(db: AnyDb, connectionId: string) {
  return db.credentials.findOne({ connectionId }, NO_ID);
}

export async function deleteCredentials(db: AnyDb, connectionId: string) {
  await db.credentials.deleteMany({ connectionId });
}

/**
 * Combines the four independently-tracked status fields into the single
 * display status the UI shows as one badge. Always derived, never stored,
 * so the four underlying fields stay the real source of truth.
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
