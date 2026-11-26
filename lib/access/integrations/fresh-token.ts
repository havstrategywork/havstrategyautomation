import type { AnyDb } from "@/lib/access/db";
import { getCredentials, updateConnectionStatus, upsertCredentials } from "@/lib/access/db/queries/connections";
import type { PlatformConnection } from "@/lib/access/db/schema-types";
import { decryptSecret, encryptSecret } from "@/lib/access/crypto/tokens";
import type { Platform } from "@/lib/access/types";
import { getAdapter } from "./registry";

const EARLY_MS = 60_000; // refresh a token that is about to expire, so it doesn't die mid-request

/**
 * The connection's access token, refreshed first if it has (nearly) expired. Google and Shopify access tokens last about an hour, so every
 * place that calls a provider goes through this. If a refresh fails the old token is returned and the health check reports it as expired.
 * `expiresAt` is the expiry of the returned token.
 */
export async function getFreshAccessToken(
  db: AnyDb,
  connection: PlatformConnection,
): Promise<{ ok: true; accessToken: string; expiresAt: Date | null; refreshed: boolean } | { ok: false; error: string; reason: "no_credential" | "decrypt_error" }> {
  const creds = await getCredentials(db, connection.id);
  if (!creds?.encryptedAccessToken) return { ok: false, reason: "no_credential", error: "No stored credential for this connection." };
  const access = decryptSecret(creds.encryptedAccessToken);
  if (!access.ok) return { ok: false, reason: "decrypt_error", error: access.error };
  const current = { ok: true as const, accessToken: access.value, expiresAt: connection.tokenExpiry, refreshed: false };

  if (!connection.tokenExpiry || connection.tokenExpiry.getTime() - Date.now() > EARLY_MS || !creds.encryptedRefreshToken) return current;
  const refresh = decryptSecret(creds.encryptedRefreshToken);
  if (!refresh.ok) return current;

  const result = await getAdapter(connection.platform as Platform).refreshAuthorization({ refreshToken: refresh.value, account: connection.providerUserId });
  if (!result.ok || !result.accessToken) return current;
  const newAccess = encryptSecret(result.accessToken);
  if (!newAccess.ok) return current;
  const newRefresh = result.refreshToken ? encryptSecret(result.refreshToken) : null;
  await upsertCredentials(db, connection.id, {
    encryptedAccessToken: newAccess.value,
    encryptedRefreshToken: newRefresh?.ok ? newRefresh.value : creds.encryptedRefreshToken,
    expiresAt: result.expiresAt ?? null,
  });
  await updateConnectionStatus(db, connection.id, { tokenValidityStatus: "valid", tokenExpiry: result.expiresAt ?? null });
  return { ok: true, accessToken: result.accessToken, expiresAt: result.expiresAt ?? null, refreshed: true };
}
