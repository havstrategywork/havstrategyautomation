import type { DiscoveredAsset, PlatformAdapter } from "../types";
import { googleOAuthMethods, googleRequest, requireGoogleOAuthConfig } from "../google/oauth";
import { PLATFORM_SCOPES } from "@/lib/access/config/permission-presets";

/**
 * Google Analytics 4 via the Analytics Admin API. Assets are GA4 properties (accountSummaries, v1beta). Agency access = an access binding for
 * GOOGLE_AGENCY_EMAIL on the property (v1alpha accessBindings): Editor when the client granted analytics.edit, otherwise Viewer.
 * Written against Google's published reference; not yet exercised against a live account.
 */
const ADMIN = "https://analyticsadmin.googleapis.com";
const EDIT_SCOPE = "https://www.googleapis.com/auth/analytics.edit";

interface AccountSummaries {
  accountSummaries?: { displayName?: string; propertySummaries?: { property: string; displayName?: string }[] }[];
  nextPageToken?: string;
}
interface Bindings {
  accessBindings?: { name: string; user?: string; roles?: string[] }[];
  nextPageToken?: string;
}

async function findAgencyBinding(accessToken: string, property: string, email: string) {
  let pageToken = "";
  do {
    const page = await googleRequest<Bindings>(`${ADMIN}/v1alpha/${property}/accessBindings?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, accessToken);
    if (!page.ok) return { ok: false as const, error: page.error };
    const hit = page.data.accessBindings?.find((b) => b.user?.toLowerCase() === email);
    if (hit) return { ok: true as const, binding: hit };
    pageToken = page.data.nextPageToken ?? "";
  } while (pageToken);
  return { ok: true as const, binding: null };
}

/** Asset ids come from the browser's selection (matched server-side to discovery), but are still checked before going into a URL. */
const validProperty = (asset: DiscoveredAsset) => /^properties\/\d+$/.test(asset.externalAssetId);

export const googleAnalyticsAdapter: PlatformAdapter = {
  platform: "google_analytics_4",
  ...googleOAuthMethods,

  async discoverAssets({ accessToken }) {
    const assets: DiscoveredAsset[] = [];
    let pageToken = "";
    do {
      const page = await googleRequest<AccountSummaries>(`${ADMIN}/v1beta/accountSummaries?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, accessToken);
      if (!page.ok) return { ok: false, assets: [], error: page.error };
      for (const account of page.data.accountSummaries ?? []) {
        for (const p of account.propertySummaries ?? []) {
          assets.push({
            externalAssetId: p.property,
            assetName: `${p.displayName ?? p.property}${account.displayName ? ` (${account.displayName})` : ""}`,
            assetType: "ga4_property",
            availablePermissions: [...PLATFORM_SCOPES.google_analytics_4],
          });
        }
      }
      pageToken = page.data.nextPageToken ?? "";
    } while (pageToken);
    return { ok: true, assets };
  },

  async requestAgencyAccess({ accessToken, asset, grantedScopes }) {
    const config = requireGoogleOAuthConfig();
    if (!config.ok) return { ok: false, status: "not_requested", error: config.error };
    if (!validProperty(asset)) return { ok: false, status: "not_requested", error: "Not a GA4 property id." };

    const existing = await findAgencyBinding(accessToken, asset.externalAssetId, config.agencyEmail);
    if (existing.ok && existing.binding) return { ok: true, status: "granted", externalRequestId: existing.binding.name };

    const role = grantedScopes?.includes(EDIT_SCOPE) ? "predefinedRoles/editor" : "predefinedRoles/viewer";
    const created = await googleRequest<{ name: string }>(`${ADMIN}/v1alpha/${asset.externalAssetId}/accessBindings`, accessToken, { method: "POST", body: { user: config.agencyEmail, roles: [role] } });
    if (!created.ok) {
      return {
        ok: true,
        status: "agency_approval_pending",
        error: `Could not add the agency automatically (${created.error}). Ask the client to add ${config.agencyEmail} in Google Analytics under Admin > Property access management.`,
      };
    }
    return { ok: true, status: "granted", externalRequestId: created.data.name };
  },

  async verifyAgencyAccess({ accessToken, asset }) {
    const config = requireGoogleOAuthConfig();
    if (!config.ok) return { ok: false, status: "agency_approval_pending", error: config.error };
    if (!validProperty(asset)) return { ok: false, status: "agency_approval_pending", error: "Not a GA4 property id." };
    const found = await findAgencyBinding(accessToken, asset.externalAssetId, config.agencyEmail);
    if (!found.ok) return { ok: false, status: "agency_approval_pending", error: found.error };
    return { ok: true, status: found.binding ? "granted" : "agency_approval_pending" };
  },

  async getConnectionHealth({ accessToken, tokenExpiry }) {
    if (!accessToken) return { health: "error", tokenValidityStatus: "invalid", detail: "No stored credential." };
    if (tokenExpiry && tokenExpiry.getTime() < Date.now()) return { health: "needs_attention", tokenValidityStatus: "expired", detail: "Access token expired and could not be refreshed." };
    const result = await googleRequest(`${ADMIN}/v1beta/accountSummaries?pageSize=1`, accessToken);
    if (!result.ok) return { health: "error", tokenValidityStatus: "invalid", detail: result.error };
    return { health: "healthy", tokenValidityStatus: "valid" };
  },
};
