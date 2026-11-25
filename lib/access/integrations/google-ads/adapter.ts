import type { PlatformAdapter } from "../types";
import { exchangeGoogleCode, refreshGoogleToken, googleAdsRequest, requireGoogleAdsConfig } from "./client";

/**
 * Real Google Ads adapter (section 6C). OAuth + token endpoints and
 * CustomerService.listAccessibleCustomers / GoogleAdsService.search are
 * standard, documented REST calls. The MCC-link step
 * (CustomerClientLinkService.mutate) is implemented against the documented
 * shape but NOT exercised against a live account in this build - verify
 * against https://developers.google.com/google-ads/api/docs/account-management/linking-manager-accounts
 * before relying on it in production (flagged here and in
 * docs/GOOGLE_ADS_APPROVAL_CHECKLIST.md).
 *
 * Per section 6C: the `adwords` OAuth scope does not distinguish read-only
 * from campaign-management access - that distinction is enforced at the
 * application level only (see lib/config/permission-presets.ts
 * `googleAdsAccessLevel`), never assumed from the scope itself.
 */
export const googleAdsAdapter: PlatformAdapter = {
  platform: "google_ads",

  isConfigured() {
    return requireGoogleAdsConfig().ok;
  },

  initiateAuthorization({ state, redirectUri, scopes }) {
    const config = requireGoogleAdsConfig();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", config.ok ? config.clientId : "");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", scopes.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    return { authorizationUrl: url.toString() };
  },

  async exchangeAuthorizationCode({ code, redirectUri }) {
    const result = await exchangeGoogleCode(code, redirectUri);
    if (!result.ok) return { ok: false, denied: result.denied, error: result.error };
    return {
      ok: true,
      accessToken: result.data.access_token,
      refreshToken: result.data.refresh_token ?? null,
      expiresAt: new Date(Date.now() + result.data.expires_in * 1000),
      grantedScopes: ["https://www.googleapis.com/auth/adwords"],
    };
  },

  async refreshAuthorization({ refreshToken }) {
    const result = await refreshGoogleToken(refreshToken);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, accessToken: result.data.access_token, refreshToken, expiresAt: new Date(Date.now() + result.data.expires_in * 1000) };
  },

  async discoverAssets({ accessToken }) {
    const accessible = await googleAdsRequest<{ resourceNames: string[] }>("/customers:listAccessibleCustomers", accessToken);
    if (!accessible.ok) return { ok: false, assets: [], error: accessible.error };

    const customerIds = (accessible.data.resourceNames ?? []).map((rn) => rn.split("/")[1]);
    const assets = await Promise.all(
      customerIds.map(async (id) => {
        const search = await googleAdsRequest<{ results?: { customer?: { descriptiveName?: string; id?: string; manager?: boolean } }[] }>(
          `/customers/${id}/googleAds:search`,
          accessToken,
          { method: "POST", body: { query: "SELECT customer.descriptive_name, customer.id, customer.manager FROM customer LIMIT 1" } },
        );
        const row = search.ok ? search.data.results?.[0]?.customer : undefined;
        return {
          externalAssetId: id,
          assetName: row?.descriptiveName ?? `Google Ads account ${id}`,
          assetType: row?.manager ? "google_ads_manager" : "google_ads_customer",
          availablePermissions: ["https://www.googleapis.com/auth/adwords"],
        };
      }),
    );

    return { ok: true, assets: assets.filter((a) => a.assetType === "google_ads_customer") };
  },

  async requestAgencyAccess({ accessToken, asset }) {
    const config = requireGoogleAdsConfig();
    if (!config.ok) return { ok: false, status: "not_requested", error: config.error };

    const result = await googleAdsRequest(`/customers/${config.managerCustomerId}/customerClientLinks:mutate`, accessToken, {
      method: "POST",
      body: {
        operations: [
          {
            create: {
              clientCustomer: `customers/${asset.externalAssetId}`,
              status: "PENDING",
            },
          },
        ],
      },
    });

    if (!result.ok) {
      return {
        ok: true,
        status: "agency_approval_pending",
        error: `Automated manager-link invitation failed (${result.error}). Guide the client to approve the pending link in their Google Ads UI under Admin > Access and security > Managers.`,
      };
    }
    return { ok: true, status: "agency_approval_pending" };
  },

  async verifyAgencyAccess({ accessToken, asset }) {
    const config = requireGoogleAdsConfig();
    if (!config.ok) return { ok: false, status: "agency_approval_pending", error: config.error };

    const search = await googleAdsRequest<{ results?: { customerClientLink?: { status?: string } }[] }>(
      `/customers/${config.managerCustomerId}/googleAds:search`,
      accessToken,
      {
        method: "POST",
        body: {
          query: `SELECT customer_client_link.status FROM customer_client_link WHERE customer_client_link.client_customer = 'customers/${asset.externalAssetId}'`,
        },
      },
    );
    if (!search.ok) return { ok: false, status: "agency_approval_pending", error: search.error };
    const status = search.data.results?.[0]?.customerClientLink?.status;
    if (status === "ACTIVE") return { ok: true, status: "granted" };
    if (status === "REFUSED" || status === "CANCELED") return { ok: true, status: "denied" };
    return { ok: true, status: "agency_approval_pending" };
  },

  async verifyPermissions({ assets, grantedScopes }) {
    // The adwords scope is all-or-nothing - "permission" here just reflects
    // whether the OAuth grant (still) includes it, not a per-asset detail.
    const hasScope = grantedScopes.includes("https://www.googleapis.com/auth/adwords");
    return { ok: true, assets: assets.map((a) => ({ externalAssetId: a.externalAssetId, verified: hasScope, grantedPermissions: hasScope ? a.availablePermissions : [] })) };
  },

  async revokeAuthorization({ accessToken }) {
    const config = requireGoogleAdsConfig();
    if (!config.ok) return { ok: false, error: config.error };
    try {
      const res = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: accessToken }).toString(),
      });
      return { ok: res.ok };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Google token revocation failed." };
    }
  },

  async getConnectionHealth({ accessToken, tokenExpiry }) {
    if (!accessToken) return { health: "error", tokenValidityStatus: "invalid", detail: "No stored credential." };
    if (tokenExpiry && tokenExpiry.getTime() < Date.now()) {
      return { health: "needs_attention", tokenValidityStatus: "expired", detail: "Access token expired and refresh has not yet been attempted." };
    }
    const result = await googleAdsRequest<{ resourceNames: string[] }>("/customers:listAccessibleCustomers", accessToken);
    if (!result.ok) return { health: "error", tokenValidityStatus: "invalid", detail: result.error };
    return { health: "healthy", tokenValidityStatus: "valid" };
  },
};
