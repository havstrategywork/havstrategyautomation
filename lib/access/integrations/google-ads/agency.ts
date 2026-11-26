import { randomUUID } from "node:crypto";
import { getDb, NO_ID, type AnyDb } from "@/lib/access/db";
import { decryptSecret, encryptSecret } from "@/lib/access/crypto/tokens";
import { googleAdsRequest, refreshGoogleToken, requireGoogleAdsConfig } from "./client";

/**
 * The AGENCY's own Google Ads authorization. Google only lets a manager (MCC) account's user send or check a manager-link invitation, so the
 * client's sign-in can't be used for that: an admin connects the agency's manager account once (Integrations page), and its refresh token is
 * kept here, encrypted. Everything about the link runs with that token; only account discovery uses the client's.
 */
const PROVIDER = "google_ads";

export async function getAgencyAuthorization(db: AnyDb) {
  const doc = await db.agencyCredentials.findOne({ provider: PROVIDER }, NO_ID);
  return doc ? { connectedAt: doc.connectedAt, connectedBy: doc.connectedBy } : null; // never hand out the token itself
}

/** Checks that the signed-in Google user can really act for the configured manager account, then stores the authorization. */
export async function saveAgencyAuthorization(
  db: AnyDb,
  input: { accessToken: string; refreshToken: string; connectedBy: string },
): Promise<{ ok: true } | { ok: false; reason: "not_manager" | "encrypt" | "config"; error: string }> {
  const config = requireGoogleAdsConfig();
  if (!config.ok) return { ok: false, reason: "config", error: config.error };

  const check = await googleAdsRequest<{ results?: { customer?: { manager?: boolean } }[] }>(`/customers/${config.managerCustomerId}/googleAds:search`, input.accessToken, {
    method: "POST",
    body: { query: "SELECT customer.id, customer.manager FROM customer LIMIT 1" },
    loginCustomerId: config.managerCustomerId,
  });
  if (!check.ok) return { ok: false, reason: "not_manager", error: check.error };
  if (!check.data.results?.[0]?.customer?.manager) return { ok: false, reason: "not_manager", error: "GOOGLE_ADS_MANAGER_CUSTOMER_ID is not a manager account." };

  const encrypted = encryptSecret(input.refreshToken);
  if (!encrypted.ok) return { ok: false, reason: "encrypt", error: encrypted.error };
  await db.agencyCredentials.updateOne(
    { provider: PROVIDER },
    { $set: { encryptedRefreshToken: encrypted.value, connectedBy: input.connectedBy, connectedAt: new Date() }, $setOnInsert: { id: randomUUID(), provider: PROVIDER } },
    { upsert: true },
  );
  cached = undefined;
  return { ok: true };
}

/** Forgets the agency authorization and asks Google to revoke it. */
export async function removeAgencyAuthorization(db: AnyDb) {
  const doc = await db.agencyCredentials.findOne({ provider: PROVIDER }, NO_ID);
  const token = doc ? decryptSecret(doc.encryptedRefreshToken) : null;
  if (token?.ok) {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: token.value }).toString(),
    }).catch(() => null);
  }
  await db.agencyCredentials.deleteMany({ provider: PROVIDER });
  cached = undefined;
}

let cached: { token: string; expiresAt: number; connectedAt: number } | undefined;

/** A current access token for the agency's manager account. */
export async function getAgencyAccessToken(): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const dbResult = await getDb();
  if (!dbResult.ok) return { ok: false, error: dbResult.error };
  const doc = await dbResult.db.agencyCredentials.findOne({ provider: PROVIDER }, NO_ID);
  if (!doc) return { ok: false, error: "The agency's Google Ads manager account is not connected (Integrations page)." };
  // Keyed on connectedAt, so another server instance reconnecting or disconnecting is picked up.
  if (cached && cached.connectedAt === +doc.connectedAt && cached.expiresAt - Date.now() > 60_000) return { ok: true, accessToken: cached.token };

  const refresh = decryptSecret(doc.encryptedRefreshToken);
  if (!refresh.ok) return { ok: false, error: refresh.error };
  const result = await refreshGoogleToken(refresh.value);
  if (!result.ok) return { ok: false, error: `The agency's Google Ads authorization has stopped working (${result.error}). Reconnect it on the Integrations page.` };
  cached = { token: result.data.access_token, expiresAt: Date.now() + result.data.expires_in * 1000, connectedAt: +doc.connectedAt };
  return { ok: true, accessToken: cached.token };
}
