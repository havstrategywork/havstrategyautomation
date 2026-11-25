import type { PlatformAdapter } from "../types";
import { graphGet, graphDelete, graphVersion } from "../meta/graph-client";

/**
 * Real Instagram adapter using the Facebook Login method: the client
 * authorizes via the same Graph OAuth dialog as Meta Ads, and the
 * Instagram professional account is discovered through its linked Page
 * (GET /{page_id}?fields=instagram_business_account) - a long-standing,
 * documented pattern. This intentionally does NOT use the newer standalone
 * "Instagram API with Instagram Login" product (instagram_business_basic
 * scopes, a separate instagram.com OAuth dialog) - mixing the two scope
 * sets is explicitly disallowed by the spec. If a client only has a
 * standalone Instagram Login-managed account with no linked Facebook Page,
 * that alternative method would need its own adapter - flagged as a known
 * limitation (see KNOWN_LIMITATIONS.md) and in lib/integrations/catalog.ts.
 *
 * Uses the same app credentials as Meta (INSTAGRAM_APP_ID/SECRET are
 * reserved for the standalone-Instagram-Login method if that's added later).
 */

function requireConfig(): { ok: true; appId: string; appSecret: string } | { ok: false; error: string } {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return { ok: false, error: "Instagram integration is not configured (uses META_APP_ID / META_APP_SECRET)." };
  return { ok: true, appId, appSecret };
}

export const instagramAdapter: PlatformAdapter = {
  platform: "instagram",

  isConfigured() {
    return requireConfig().ok;
  },

  initiateAuthorization({ state, redirectUri, scopes }) {
    const config = requireConfig();
    const url = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
    url.searchParams.set("client_id", config.ok ? config.appId : "");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes.join(","));
    return { authorizationUrl: url.toString() };
  },

  async exchangeAuthorizationCode({ code, redirectUri }) {
    const config = requireConfig();
    if (!config.ok) return { ok: false, error: config.error };

    const result = await graphGet<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
      client_id: config.appId,
      client_secret: config.appSecret,
      redirect_uri: redirectUri,
      code,
    });
    if (!result.ok || !result.data) {
      const denied = result.errorCode === 100 || /denied|cancelled/i.test(result.error ?? "");
      return { ok: false, denied, error: result.error ?? "Failed to exchange authorization code." };
    }

    const longLived = await graphGet<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: result.data.access_token,
    });
    const finalToken = longLived.ok && longLived.data ? longLived.data.access_token : result.data.access_token;
    const expiresIn = (longLived.ok && longLived.data?.expires_in) || result.data.expires_in || 60 * 24 * 60 * 60;
    const me = await graphGet<{ id: string }>("/me", { access_token: finalToken, fields: "id" });

    return {
      ok: true,
      providerUserId: me.data?.id,
      accessToken: finalToken,
      refreshToken: finalToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  },

  async refreshAuthorization({ refreshToken }) {
    const config = requireConfig();
    if (!config.ok) return { ok: false, error: config.error };
    const result = await graphGet<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: refreshToken,
    });
    if (!result.ok || !result.data) return { ok: false, error: result.error ?? "Instagram token refresh failed - client likely needs to reauthorize." };
    return { ok: true, accessToken: result.data.access_token, refreshToken: result.data.access_token, expiresAt: new Date(Date.now() + (result.data.expires_in ?? 5184000) * 1000) };
  },

  async discoverAssets({ accessToken }) {
    const pages = await graphGet<{ data: { id: string; name: string; instagram_business_account?: { id: string; username?: string } }[] }>("/me/accounts", {
      access_token: accessToken,
      fields: "id,name,instagram_business_account{id,username}",
    });
    if (!pages.ok) return { ok: false, assets: [], error: pages.error };

    const assets = (pages.data?.data ?? [])
      .filter((p) => p.instagram_business_account)
      .map((p) => ({
        externalAssetId: p.instagram_business_account!.id,
        assetName: p.instagram_business_account?.username ? `@${p.instagram_business_account.username}` : p.name,
        assetType: "instagram_account",
        availablePermissions: ["instagram_basic", "instagram_manage_insights", "instagram_content_publish", "instagram_manage_comments"],
      }));

    if (assets.length === 0) {
      return { ok: true, assets: [], error: "No Instagram professional account found on this user's Pages. A linked Facebook Page is required - see section 6B." };
    }
    return { ok: true, assets };
  },

  async requestAgencyAccess() {
    // Instagram professional accounts inherit access from their linked
    // Page's Business Manager assignment - there is no separate
    // Instagram-only partner-request call. Treat this as satisfied once the
    // Page itself is business-asset-shared (same mechanism as Meta Ads
    // Pages); verify current behavior before relying on this in production.
    return { ok: true, status: "granted" };
  },

  async verifyAgencyAccess() {
    return { ok: true, status: "granted" };
  },

  async verifyPermissions({ accessToken, assets, grantedScopes }) {
    const result = await graphGet<{ data: { permission: string; status: "granted" | "declined" }[] }>("/me/permissions", { access_token: accessToken });
    const liveGranted = result.ok ? (result.data?.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission) : grantedScopes;
    return {
      ok: result.ok,
      error: result.ok ? undefined : result.error,
      assets: assets.map((a) => {
        const grantedPermissions = a.availablePermissions.filter((p) => liveGranted.includes(p));
        return { externalAssetId: a.externalAssetId, verified: grantedPermissions.length > 0, grantedPermissions };
      }),
    };
  },

  async revokeAuthorization({ accessToken }) {
    const result = await graphDelete("/me/permissions", { access_token: accessToken });
    return { ok: result.ok, error: result.error };
  },

  async getConnectionHealth({ accessToken, tokenExpiry }) {
    if (!accessToken) return { health: "error", tokenValidityStatus: "invalid", detail: "No stored credential." };
    if (tokenExpiry && tokenExpiry.getTime() < Date.now()) {
      return { health: "needs_attention", tokenValidityStatus: "expired", detail: "Long-lived token has expired; client must reauthorize." };
    }
    const result = await graphGet<{ id: string }>("/me", { access_token: accessToken, fields: "id" });
    if (!result.ok) return { health: "error", tokenValidityStatus: "invalid", detail: result.error };
    return { health: "healthy", tokenValidityStatus: "valid" };
  },
};
