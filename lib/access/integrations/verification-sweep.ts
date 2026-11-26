import type { AnyDb } from "@/lib/access/db";
import { listActiveConnections, updateConnectionStatus, listAssetsForConnection } from "@/lib/access/db/queries/connections";
import { getFreshAccessToken } from "./fresh-token";
import { getClientByIdTrusted } from "@/lib/access/db/queries/clients";
import { getAdapter } from "./registry";
import { reverifyConnectionAssets } from "./oauth-flow";
import { notify } from "@/lib/access/notifications";
import { listOrganizationMembers } from "@/lib/access/db/queries/users";
import { logAudit } from "@/lib/access/audit";
import { PLATFORM_CATALOG } from "./catalog";
import type { Platform } from "@/lib/access/types";
import type { PlatformConnection } from "@/lib/access/db/schema-types";

/**
 * Background job (section 13: "background job scheduler for connection
 * verification"; section 16: token expiry/refresh handling). Runs via
 * POST /api/cron/verify-connections on a schedule. Re-checks every actively
 * authorized connection's token health, attempts a silent refresh where the
 * provider supports one, and re-polls agency access for anything still
 * pending - then notifies once per state change (dedup handled by
 * lib/notifications).
 */
export async function runVerificationSweep(db: AnyDb): Promise<{ checked: number; expired: number; refreshed: number; reverified: number }> {
  const connections = await listActiveConnections(db);
  let expired = 0;
  let refreshed = 0;
  let reverified = 0;

  for (const connection of connections) {
    const token = await getFreshAccessToken(db, connection);
    if (!token.ok) continue;
    if (token.refreshed) refreshed += 1;

    const platform = connection.platform as Platform;
    const adapter = getAdapter(platform);
    const health = await adapter.getConnectionHealth({ accessToken: token.accessToken, tokenExpiry: token.expiresAt, account: connection.providerUserId });

    if (health.tokenValidityStatus === "expired") {
      await markExpired(db, connection, platform);
      expired += 1;
      continue;
    }
    await updateConnectionStatus(db, connection.id, { tokenValidityStatus: health.tokenValidityStatus, connectionHealth: health.health });
    const accessToken = token.accessToken;

    if (connection.agencyAccessStatus === "agency_approval_pending") {
      const assets = await listAssetsForConnection(db, connection.id);
      if (assets.length > 0) {
        await reverifyConnectionAssets(
          db,
          connection.id,
          accessToken,
          assets.map((a) => ({ externalAssetId: a.externalAssetId, assetName: a.assetName, assetType: a.assetType, availablePermissions: a.grantedPermissions as string[] })),
        );
        reverified += 1;
      }
    }
  }

  return { checked: connections.length, expired, refreshed, reverified };
}

async function markExpired(db: AnyDb, connection: PlatformConnection, platform: Platform) {
  await updateConnectionStatus(db, connection.id, { oauthAuthorizationStatus: "authorization_expired", tokenValidityStatus: "expired", connectionHealth: "needs_attention" });
  const client = await getClientByIdTrusted(db, connection.clientId);
  await logAudit(db, { organizationId: connection.organizationId, clientId: connection.clientId, actorType: "system", action: "token.expired", platform });
  if (client) {
    const members = await listOrganizationMembers(db, connection.organizationId);
    await notify(db, {
      organizationId: connection.organizationId,
      clientId: connection.clientId,
      type: "expired_authorization",
      recipients: members.map((m) => ({ kind: "agency_user" as const, userId: m.userId, email: m.email })),
      context: { brandName: client.brandName, platformLabel: PLATFORM_CATALOG[platform]?.label },
    });
  }
}
