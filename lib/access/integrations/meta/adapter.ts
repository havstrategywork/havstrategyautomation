import type { PlatformAdapter } from "../types";
import { graphGet, graphPost, graphDelete, graphVersion, requireMetaConfig } from "./graph-client";

/**
 * Real Meta Ads adapter (Facebook Login for Business + Marketing API +
 * Business Management API - section 6A). OAuth dialog, code/token exchange,
 * long-lived token upgrade, ad-account/Page discovery and the
 * /me/permissions-based verification are all standard, documented Graph API
 * calls. The agency-partner-access step (requestAgencyAccess) is NOT
 * verified against current docs - Meta's business-to-business asset
 * sharing endpoints have changed shape multiple times, so this method
 * attempts the most likely current call and, on any failure, falls back to
 * the documented manual Business Manager approval path rather than ever
 * claiming access that wasn't actually confirmed. See
 * docs/META_APP_REVIEW_CHECKLIST.md before relying on it in production.
 */
export const metaAdsAdapter: PlatformAdapter = {
  platform: "meta_ads",

  isConfigured() {
    return requireMetaConfig().ok;
  },

  initiateAuthorization({ state, redirectUri, scopes }) {
    const appId = process.env.META_APP_ID ?? "";
    const loginConfigId = process.env.META_LOGIN_CONFIG_ID;
    const url = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    if (loginConfigId) {
      // Facebook Login for Business: the login configuration itself defines
      // the requested asset types/permissions. config_id and scope are
      // mutually reinforcing here, not exclusive - verify current behavior
      // for your configuration in Meta Business Manager > Login Configurations.
      url.searchParams.set("config_id", loginConfigId);
    }
    url.searchParams.set("scope", scopes.join(","));
    return { authorizationUrl: url.toString() };
  },

  async exchangeAuthorizationCode({ code, redirectUri }) {
    const config = requireMetaConfig();
    if (!config.ok) return { ok: false, error: config.error };

    const tokenResult = await graphGet<{ access_token: string; token_type: string; expires_in?: number }>("/oauth/access_token", {
      client_id: config.appId,
      client_secret: config.appSecret,
      redirect_uri: redirectUri,
      code,
    });
    if (!tokenResult.ok || !tokenResult.data) {
      const denied = tokenResult.errorCode === 100 || /denied|cancelled/i.test(tokenResult.error ?? "");
      return { ok: false, denied, error: tokenResult.error ?? "Failed to exchange authorization code." };
    }

    // Upgrade to a long-lived token (~60 days) immediately - Meta user
    // access tokens have no separate refresh_token; refreshAuthorization()
    // below re-runs this same exchange using the still-valid long-lived
    // token itself.
    const longLived = await graphGet<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: tokenResult.data.access_token,
    });
    const finalToken = longLived.ok && longLived.data ? longLived.data.access_token : tokenResult.data.access_token;
    const expiresIn = (longLived.ok && longLived.data?.expires_in) || tokenResult.data.expires_in || 60 * 24 * 60 * 60;

    const me = await graphGet<{ id: string }>("/me", { access_token: finalToken, fields: "id" });

    return {
      ok: true,
      providerUserId: me.data?.id,
      accessToken: finalToken,
      refreshToken: finalToken, // see note above: Meta has no distinct refresh token for user access tokens
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  },

  async refreshAuthorization({ refreshToken }) {
    const config = requireMetaConfig();
    if (!config.ok) return { ok: false, error: config.error };

    const result = await graphGet<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: refreshToken,
    });
    if (!result.ok || !result.data) {
      return { ok: false, error: result.error ?? "Meta rejected the refresh - the client likely needs to reauthorize." };
    }
    return {
      ok: true,
      accessToken: result.data.access_token,
      refreshToken: result.data.access_token,
      expiresAt: new Date(Date.now() + (result.data.expires_in ?? 60 * 24 * 60 * 60) * 1000),
    };
  },

  async discoverAssets({ accessToken }) {
    const [adAccounts, pages] = await Promise.all([
      graphGet<{ data: { id: string; name: string; account_status?: number }[] }>("/me/adaccounts", {
        access_token: accessToken,
        fields: "id,name,account_status",
      }),
      graphGet<{ data: { id: string; name: string }[] }>("/me/accounts", { access_token: accessToken, fields: "id,name" }),
    ]);

    if (!adAccounts.ok && !pages.ok) {
      return { ok: false, assets: [], error: adAccounts.error ?? pages.error ?? "Failed to discover Meta assets." };
    }

    const assets = [
      ...(adAccounts.data?.data ?? []).map((a) => ({
        externalAssetId: a.id,
        assetName: a.name,
        assetType: "ad_account" as const,
        availablePermissions: ["ads_read", "ads_management"],
      })),
      ...(pages.data?.data ?? []).map((p) => ({
        externalAssetId: p.id,
        assetName: p.name,
        assetType: "page" as const,
        availablePermissions: ["pages_show_list", "pages_read_engagement"],
      })),
    ];

    return { ok: true, assets };
  },

  async requestAgencyAccess({ accessToken, asset }) {
    const agencyBusinessId = process.env.META_AGENCY_BUSINESS_ID;
    if (!agencyBusinessId) {
      return { ok: false, status: "not_requested", error: "META_AGENCY_BUSINESS_ID is not configured." };
    }

    if (asset.assetType === "ad_account") {
      // Best-effort against the Business Asset Sharing pattern for ad
      // accounts (POST /{ad_account_id}/agencies) - NOT verified against
      // current docs (see module header). Any failure here is expected
      // until confirmed and falls through to the manual guidance below.
      const result = await graphPost(`/${asset.externalAssetId}/agencies`, {
        access_token: accessToken,
        business: agencyBusinessId,
        permitted_tasks: JSON.stringify(["ADVERTISE", "ANALYZE"]),
      });
      if (result.ok) return { ok: true, status: "agency_approval_pending" };
    }

    return {
      ok: true,
      status: "agency_approval_pending",
      error:
        "Automated partner-access request is unverified for this asset type. Guide the client: Business Settings > Users > Partners > Add, " +
        `using agency Business ID ${agencyBusinessId}.`,
    };
  },

  async verifyAgencyAccess({ accessToken, asset }) {
    const result = await graphGet<{ data: { id: string; name: string }[] }>(`/${asset.externalAssetId}/agencies`, {
      access_token: accessToken,
      fields: "id,name",
    });
    if (!result.ok) return { ok: false, status: "agency_approval_pending", error: result.error };
    const agencyBusinessId = process.env.META_AGENCY_BUSINESS_ID;
    const granted = (result.data?.data ?? []).some((a) => a.id === agencyBusinessId);
    return { ok: true, status: granted ? "granted" : "agency_approval_pending" };
  },

  async verifyPermissions({ accessToken, assets, grantedScopes }) {
    const result = await graphGet<{ data: { permission: string; status: "granted" | "declined" }[] }>("/me/permissions", { access_token: accessToken });
    const liveGranted = result.ok
      ? (result.data?.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission)
      : grantedScopes;

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
