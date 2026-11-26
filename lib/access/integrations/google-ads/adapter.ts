import type { AgencyAccessResult, PlatformAdapter } from "../types";
import { exchangeGoogleCode, refreshGoogleToken, googleAdsRequest, requireGoogleAdsConfig } from "./client";
import { getAgencyAccessToken } from "./agency";

/**
 * Real Google Ads adapter. Account discovery uses the CLIENT's authorization. Agency access is a manager-account (MCC) link, and Google's rule is
 * that the manager sends the invitation and the client accepts it, so both sending and checking use the AGENCY's authorization (./agency.ts):
 *   1. POST customers/{manager}/customerClientLinks:mutate  {operation:{create:{clientCustomer, status:"PENDING"}}}
 *   2. the client accepts in Google Ads (Admin > Access and security > Managers)
 *   3. customer_client_link.status becomes ACTIVE (seen by the verification sweep / "Check access").
 * Written against developers.google.com (linking guide, REST auth); not yet exercised against a live account.
 *
 * The `adwords` OAuth scope does not distinguish read-only from campaign-management access - that distinction is enforced at the application
 * level only (see lib/config/permission-presets.ts `googleAdsAccessLevel`), never assumed from the scope itself.
 */
const ADWORDS = "https://www.googleapis.com/auth/adwords";
const dashed = (id: string) => id.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3");

type LinkState = "ACTIVE" | "PENDING" | "REFUSED" | "NONE";

/** The state of the manager link to one client account (old cancelled links can sit beside a newer one, so the best one wins). */
async function linkState(agencyToken: string, managerId: string, customerId: string): Promise<{ ok: true; state: LinkState } | { ok: false; error: string }> {
  const search = await googleAdsRequest<{ results?: { customerClientLink?: { status?: string } }[] }>(`/customers/${managerId}/googleAds:search`, agencyToken, {
    method: "POST",
    body: { query: `SELECT customer_client_link.status FROM customer_client_link WHERE customer_client_link.client_customer = 'customers/${customerId}'` },
    loginCustomerId: managerId,
  });
  if (!search.ok) return { ok: false, error: search.error };
  const statuses = (search.data.results ?? []).map((r) => r.customerClientLink?.status);
  const state: LinkState = statuses.includes("ACTIVE") ? "ACTIVE" : statuses.includes("PENDING") ? "PENDING" : statuses.includes("REFUSED") || statuses.includes("CANCELED") ? "REFUSED" : "NONE";
  return { ok: true, state };
}

// These sentences are shown to the client on the onboarding page; technical detail goes to the server log only.
const accept = (managerId: string) => `We've sent an access request from our Google Ads manager account (${dashed(managerId)}). In Google Ads, open Admin > Access and security > Managers and accept it.`;
const FOLLOW_UP = "We couldn't send the Google Ads access request automatically. Our team will follow up with you.";

async function invite(agencyToken: string, managerId: string, customerId: string): Promise<AgencyAccessResult> {
  const created = await googleAdsRequest<{ result?: { resourceName?: string } }>(`/customers/${managerId}/customerClientLinks:mutate`, agencyToken, {
    method: "POST",
    body: { operation: { create: { clientCustomer: `customers/${customerId}`, status: "PENDING" } } },
    loginCustomerId: managerId,
  });
  if (!created.ok) {
    console.warn(`google ads: invitation for ${customerId} failed: ${created.error}`);
    return { ok: true, status: "agency_approval_pending", error: FOLLOW_UP };
  }
  return { ok: true, status: "agency_approval_pending", externalRequestId: created.data.result?.resourceName, error: accept(managerId) };
}

/** Where the link stands, sending the invitation if there is none yet (`reinvite`: also after a refusal, when the client shares the account again). */
async function syncLink(customerId: string, reinvite: boolean): Promise<AgencyAccessResult> {
  const config = requireGoogleAdsConfig();
  if (!config.ok) return { ok: false, status: "agency_approval_pending", error: config.error };
  if (!/^\d{1,19}$/.test(customerId)) return { ok: false, status: "not_requested", error: "Not a Google Ads customer id." };
  const agency = await getAgencyAccessToken();
  if (!agency.ok) {
    console.warn(`google ads: ${agency.error}`);
    return { ok: true, status: "agency_approval_pending", error: FOLLOW_UP };
  }
  const link = await linkState(agency.accessToken, config.managerCustomerId, customerId);
  if (!link.ok) {
    console.warn(`google ads: link status for ${customerId} failed: ${link.error}`);
    return { ok: false, status: "agency_approval_pending", error: FOLLOW_UP };
  }
  if (link.state === "ACTIVE") return { ok: true, status: "granted" };
  if (link.state === "PENDING") return { ok: true, status: "agency_approval_pending", error: accept(config.managerCustomerId) };
  if (link.state === "REFUSED" && !reinvite) return { ok: true, status: "denied" };
  return invite(agency.accessToken, config.managerCustomerId, customerId);
}

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
      grantedScopes: [ADWORDS],
    };
  },

  async refreshAuthorization({ refreshToken }) {
    const result = await refreshGoogleToken(refreshToken);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, accessToken: result.data.access_token, refreshToken, expiresAt: new Date(Date.now() + result.data.expires_in * 1000) };
  },

  async discoverAssets({ accessToken }) {
    const accessible = await googleAdsRequest<{ resourceNames?: string[] }>("/customers:listAccessibleCustomers", accessToken);
    if (!accessible.ok) return { ok: false, assets: [], error: accessible.error };

    const customerIds = (accessible.data.resourceNames ?? []).map((rn) => rn.split("/")[1]);
    const assets = await Promise.all(
      customerIds.map(async (id) => {
        // The client's own user is querying their own account: no login-customer-id.
        const search = await googleAdsRequest<{ results?: { customer?: { descriptiveName?: string; id?: string; manager?: boolean } }[] }>(`/customers/${id}/googleAds:search`, accessToken, {
          method: "POST",
          body: { query: "SELECT customer.descriptive_name, customer.id, customer.manager FROM customer LIMIT 1" },
        });
        const row = search.ok ? search.data.results?.[0]?.customer : undefined;
        return {
          externalAssetId: id,
          assetName: row?.descriptiveName ?? `Google Ads account ${dashed(id)}`,
          assetType: row?.manager ? "google_ads_manager" : "google_ads_customer",
          availablePermissions: [ADWORDS],
        };
      }),
    );

    return { ok: true, assets: assets.filter((a) => a.assetType === "google_ads_customer") };
  },

  async requestAgencyAccess({ asset }) {
    return syncLink(asset.externalAssetId, true);
  },

  async verifyAgencyAccess({ asset }) {
    return syncLink(asset.externalAssetId, false);
  },

  async verifyPermissions({ assets, grantedScopes }) {
    // The adwords scope is all-or-nothing - "permission" here just reflects
    // whether the OAuth grant (still) includes it, not a per-asset detail.
    const hasScope = grantedScopes.includes(ADWORDS);
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
    const result = await googleAdsRequest<{ resourceNames?: string[] }>("/customers:listAccessibleCustomers", accessToken);
    if (!result.ok) return { health: "error", tokenValidityStatus: "invalid", detail: result.error };
    return { health: "healthy", tokenValidityStatus: "valid" };
  },
};
