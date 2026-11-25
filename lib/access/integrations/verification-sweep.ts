import type { AnyDb } from "@/lib/access/db";
import { listActiveConnections, getCredentials, updateConnectionStatus, upsertCredentials, listAssetsForConnection } from "@/lib/access/db/queries/connections";
import { getClientByIdTrusted } from "@/lib/access/db/queries/clients";
import { getAdapter } from "./registry";
import { decryptSecret, encryptSecret } from "@/lib/access/crypto/tokens";
import { reverifyConnectionAssets } from "./oauth-flow";
import { notify } from "@/lib/access/notifications";
import { listOrganizationMembers } from "@/lib/access/db/queries/users";
import { logAudit } from "@/lib/access/audit";
import { PLATFORM_CATALOG } from "./catalog";
import type { Phase1Platform } from "@/lib/access/types";
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
    const creds = await getCredentials(db, connection.id);
    if (!creds?.encryptedAccessToken) continue;

    const tokenResult = decryptSecret(creds.encryptedAccessToken);
    if (!tokenResult.ok) continue;

    const platform = connection.platform as Phase1Platform;
    const adapter = getAdapter(platform);
    const health = await adapter.getConnectionHealth({ accessToken: tokenResult.value, tokenExpiry: connection.tokenExpiry });

    let accessToken = tokenResult.value;

    if (health.tokenValidityStatus === "expired") {
      const refreshed_ = await attemptRefresh(db, connection, creds.encryptedRefreshToken, adapter);
      if (!refreshed_.ok) {
        await markExpired(db, connection, platform);
        expired += 1;
        continue;
      }
      accessToken = refreshed_.accessToken;
      refreshed += 1;
    } else {
      await updateConnectionStatus(db, connection.id, { tokenValidityStatus: health.tokenValidityStatus, connectionHealth: health.health });
    }

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

async function attemptRefresh(
  db: AnyDb,
  connection: PlatformConnection,
  encryptedRefreshToken: string | null,
  adapter: ReturnType<typeof getAdapter>,
): Promise<{ ok: true; accessToken: string } | { ok: false }> {
  if (!encryptedRefreshToken) return { ok: false };
  const refreshToken = decryptSecret(encryptedRefreshToken);
  if (!refreshToken.ok) return { ok: false };

  const result = await adapter.refreshAuthorization({ refreshToken: refreshToken.value });
  if (!result.ok || !result.accessToken) return { ok: false };

  const newAccess = encryptSecret(result.accessToken);
  const newRefresh = result.refreshToken ? encryptSecret(result.refreshToken) : null;
  await upsertCredentials(db, connection.id, {
    encryptedAccessToken: newAccess.ok ? newAccess.value : encryptedRefreshToken,
    encryptedRefreshToken: newRefresh && newRefresh.ok ? newRefresh.value : encryptedRefreshToken,
    expiresAt: result.expiresAt ?? null,
  });
  await updateConnectionStatus(db, connection.id, { tokenValidityStatus: "valid", tokenExpiry: result.expiresAt ?? null, connectionHealth: "healthy" });

  return { ok: true, accessToken: result.accessToken };
}

async function markExpired(db: AnyDb, connection: PlatformConnection, platform: Phase1Platform) {
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
