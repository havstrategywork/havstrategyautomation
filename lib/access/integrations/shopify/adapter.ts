import { createHmac, timingSafeEqual } from "node:crypto";
import type { PlatformAdapter } from "../types";
import { normalizeShopDomain } from "./shop";
import { PLATFORM_SCOPES } from "@/lib/access/config/permission-presets";

/**
 * Shopify, authorization code grant with EXPIRING offline tokens (1h access token + 90-day rotating refresh token; required by Shopify for new
 * apps). The client types their store domain, installs the agency's app on that store, and the installed app IS the agency's access, so there
 * is no separate approval step. Store data is read through the GraphQL Admin API. Written against shopify.dev; not yet exercised on a live store.
 */
function requireShopifyConfig(): { ok: true; apiKey: string; apiSecret: string } | { ok: false; error: string } {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey || !apiSecret) return { ok: false, error: "Shopify integration is not configured (SHOPIFY_API_KEY, SHOPIFY_API_SECRET)." };
  return { ok: true, apiKey, apiSecret };
}

const apiVersion = () => process.env.SHOPIFY_API_VERSION?.trim() || "2026-10";

/** Shopify signs the callback: HMAC-SHA256 (app secret) over the other query parameters, sorted and joined as k=v&k=v. */
export function verifyShopifyHmac(params: URLSearchParams, secret: string): boolean {
  const given = params.get("hmac");
  if (!given) return false;
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const expected = Buffer.from(createHmac("sha256", secret).update(message).digest("hex"));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Shopify reports only write_x when both were asked for: a write scope includes reading. */
const withImpliedReads = (scopes: string[]) => [...new Set(scopes.flatMap((s) => (s.startsWith("write_") ? [s, s.replace("write_", "read_")] : [s])))];

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(shop: string, params: Record<string, string>) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(params).toString(),
  }).catch(() => null);
  if (!res) return { ok: false as const, error: "Shopify token request failed." };
  const data = (await res.json().catch(() => null)) as TokenResponse | null;
  if (!res.ok || !data?.access_token) return { ok: false as const, error: data?.error_description ?? data?.error ?? `Shopify returned ${res.status}` };
  return { ok: true as const, data };
}

async function queryShop(shop: string, accessToken: string) {
  try {
    const res = await fetch(`https://${shop}/admin/api/${apiVersion()}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
      body: JSON.stringify({ query: "{ shop { name myshopifyDomain } }" }),
    });
    const json = (await res.json().catch(() => null)) as { data?: { shop?: { name: string; myshopifyDomain: string } }; errors?: unknown } | null;
    if (!res.ok || !json?.data?.shop) return { ok: false as const, error: `Shopify API returned ${res.status}${json?.errors ? `: ${JSON.stringify(json.errors).slice(0, 200)}` : ""}` };
    return { ok: true as const, shop: json.data.shop };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Shopify API request failed." };
  }
}

const shopOf = (account?: string | null) => (account ? normalizeShopDomain(account) : null);
const NO_SHOP = "The Shopify store domain for this connection is missing.";

export const shopifyAdapter: PlatformAdapter = {
  platform: "shopify",

  isConfigured: () => requireShopifyConfig().ok,

  initiateAuthorization({ state, redirectUri, scopes, account }) {
    const config = requireShopifyConfig();
    const shop = shopOf(account);
    if (!shop) throw new Error(NO_SHOP); // startAuthorization validates the domain first
    const url = new URL(`https://${shop}/admin/oauth/authorize`);
    url.searchParams.set("client_id", config.ok ? config.apiKey : "");
    url.searchParams.set("scope", scopes.join(","));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return { authorizationUrl: url.toString() };
  },

  async exchangeAuthorizationCode({ code, account, callbackParams, requestedScopes }) {
    const config = requireShopifyConfig();
    if (!config.ok) return { ok: false, error: config.error };
    const shop = shopOf(account);
    if (!shop) return { ok: false, error: NO_SHOP };
    if (!callbackParams || !verifyShopifyHmac(callbackParams, config.apiSecret)) return { ok: false, error: "Shopify callback signature check failed." };
    if (shopOf(callbackParams.get("shop")) !== shop) return { ok: false, error: "Shopify callback is for a different store than the one requested." };

    const result = await tokenRequest(shop, { client_id: config.apiKey, client_secret: config.apiSecret, code, expiring: "1" });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      providerUserId: shop,
      accessToken: result.data.access_token,
      refreshToken: result.data.refresh_token ?? null,
      expiresAt: result.data.expires_in ? new Date(Date.now() + result.data.expires_in * 1000) : null,
      grantedScopes: withImpliedReads(result.data.scope ? result.data.scope.split(",") : requestedScopes),
    };
  },

  async refreshAuthorization({ refreshToken, account }) {
    const config = requireShopifyConfig();
    if (!config.ok) return { ok: false, error: config.error };
    const shop = shopOf(account);
    if (!shop) return { ok: false, error: NO_SHOP };
    const result = await tokenRequest(shop, { client_id: config.apiKey, client_secret: config.apiSecret, grant_type: "refresh_token", refresh_token: refreshToken });
    if (!result.ok) return { ok: false, error: result.error };
    // The refresh token rotates: always keep the newest one.
    return { ok: true, accessToken: result.data.access_token, refreshToken: result.data.refresh_token ?? refreshToken, expiresAt: result.data.expires_in ? new Date(Date.now() + result.data.expires_in * 1000) : null };
  },

  async discoverAssets({ accessToken, account }) {
    const shop = shopOf(account);
    if (!shop) return { ok: false, assets: [], error: NO_SHOP };
    const result = await queryShop(shop, accessToken);
    if (!result.ok) return { ok: false, assets: [], error: result.error };
    return { ok: true, assets: [{ externalAssetId: result.shop.myshopifyDomain, assetName: result.shop.name, assetType: "shopify_store", availablePermissions: [...PLATFORM_SCOPES.shopify] }] };
  },

  async requestAgencyAccess({ accessToken, account }) {
    return this.verifyAgencyAccess({ accessToken, account, asset: { externalAssetId: "", assetName: "", assetType: "shopify_store", availablePermissions: [] } });
  },

  async verifyAgencyAccess({ accessToken, account }) {
    const shop = shopOf(account);
    if (!shop) return { ok: false, status: "agency_approval_pending", error: NO_SHOP };
    const result = await queryShop(shop, accessToken);
    return result.ok ? { ok: true, status: "granted" } : { ok: false, status: "agency_approval_pending", error: result.error };
  },

  async verifyPermissions({ assets, grantedScopes }) {
    const granted = withImpliedReads(grantedScopes);
    return {
      ok: true,
      assets: assets.map((a) => {
        const grantedPermissions = a.availablePermissions.filter((p) => granted.includes(p));
        return { externalAssetId: a.externalAssetId, verified: grantedPermissions.length > 0, grantedPermissions };
      }),
    };
  },

  async revokeAuthorization({ accessToken, account }) {
    const shop = shopOf(account);
    if (!shop) return { ok: false, error: NO_SHOP };
    try {
      // Revoking the app's access token uninstalls the app from the store.
      const res = await fetch(`https://${shop}/admin/api_permissions/current.json`, { method: "DELETE", headers: { "X-Shopify-Access-Token": accessToken } });
      return res.ok ? { ok: true } : { ok: false, error: `Shopify returned ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Shopify revocation failed." };
    }
  },

  async getConnectionHealth({ accessToken, tokenExpiry, account }) {
    if (!accessToken) return { health: "error", tokenValidityStatus: "invalid", detail: "No stored credential." };
    if (tokenExpiry && tokenExpiry.getTime() < Date.now()) return { health: "needs_attention", tokenValidityStatus: "expired", detail: "Access token expired and could not be refreshed." };
    const shop = shopOf(account);
    if (!shop) return { health: "error", tokenValidityStatus: "invalid", detail: NO_SHOP };
    const result = await queryShop(shop, accessToken);
    if (!result.ok) return { health: "error", tokenValidityStatus: "invalid", detail: result.error };
    return { health: "healthy", tokenValidityStatus: "valid" };
  },
};
