import type { DiscoveredAsset, PlatformAdapter } from "../types";
import { googleOAuthMethods, googleRequest, requireGoogleOAuthConfig } from "../google/oauth";
import { PLATFORM_SCOPES } from "@/lib/access/config/permission-presets";

/**
 * Google Tag Manager API v2. Assets are containers ("accounts/1/containers/2"). Agency access = a user permission for GOOGLE_AGENCY_EMAIL on the
 * container's account, with container access matching what the client granted (publish > edit > read). One user permission covers all of an
 * account's containers, so a second container is added to the existing entry. Written against Google's published reference; not yet exercised live.
 */
const API = "https://tagmanager.googleapis.com/tagmanager/v2";
const SCOPE = "https://www.googleapis.com/auth/tagmanager.";

interface UserPermission {
  path: string;
  emailAddress?: string;
  accountAccess?: { permission?: string };
  containerAccess?: { containerId: string; permission: string }[];
}

const parse = (asset: DiscoveredAsset) => /^(accounts\/\d+)\/containers\/(\d+)$/.exec(asset.externalAssetId);

async function findAgencyPermission(accessToken: string, account: string, email: string) {
  let pageToken = "";
  do {
    const page = await googleRequest<{ userPermission?: UserPermission[]; nextPageToken?: string }>(`${API}/${account}/user_permissions${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ""}`, accessToken);
    if (!page.ok) return { ok: false as const, error: page.error };
    const hit = page.data.userPermission?.find((u) => u.emailAddress?.toLowerCase() === email);
    if (hit) return { ok: true as const, permission: hit };
    pageToken = page.data.nextPageToken ?? "";
  } while (pageToken);
  return { ok: true as const, permission: null };
}

export const googleTagManagerAdapter: PlatformAdapter = {
  platform: "google_tag_manager",
  ...googleOAuthMethods,

  async discoverAssets({ accessToken }) {
    const accounts = await googleRequest<{ account?: { path: string; name?: string }[] }>(`${API}/accounts`, accessToken);
    if (!accounts.ok) return { ok: false, assets: [], error: accounts.error };
    const assets: DiscoveredAsset[] = [];
    for (const account of accounts.data.account ?? []) {
      const containers = await googleRequest<{ container?: { path: string; name?: string; publicId?: string }[] }>(`${API}/${account.path}/containers`, accessToken);
      if (!containers.ok) return { ok: false, assets: [], error: containers.error };
      for (const c of containers.data.container ?? []) {
        assets.push({
          externalAssetId: c.path,
          assetName: `${c.name ?? c.path}${c.publicId ? ` (${c.publicId})` : ""}`,
          assetType: "gtm_container",
          availablePermissions: [...PLATFORM_SCOPES.google_tag_manager],
        });
      }
    }
    return { ok: true, assets };
  },

  async requestAgencyAccess({ accessToken, asset, grantedScopes }) {
    const config = requireGoogleOAuthConfig();
    if (!config.ok) return { ok: false, status: "not_requested", error: config.error };
    const ids = parse(asset);
    if (!ids) return { ok: false, status: "not_requested", error: "Not a Tag Manager container id." };
    const [, account, containerId] = ids;

    const level = grantedScopes?.includes(`${SCOPE}publish`) ? "publish" : grantedScopes?.includes(`${SCOPE}edit.containers`) ? "edit" : "read";
    const pending = (error: string) => ({
      ok: true,
      status: "agency_approval_pending" as const,
      error: `Could not add the agency automatically (${error}). Ask the client to add ${config.agencyEmail} in Tag Manager under Admin > User Management.`,
    });

    const existing = await findAgencyPermission(accessToken, account, config.agencyEmail);
    if (!existing.ok) return pending(existing.error);
    const containerAccess = [...(existing.permission?.containerAccess ?? []).filter((c) => c.containerId !== containerId), { containerId, permission: level }];
    const result = existing.permission
      ? await googleRequest<UserPermission>(`${API}/${existing.permission.path}`, accessToken, { method: "PUT", body: { ...existing.permission, containerAccess } })
      : await googleRequest<UserPermission>(`${API}/${account}/user_permissions`, accessToken, { method: "POST", body: { emailAddress: config.agencyEmail, accountAccess: { permission: "user" }, containerAccess } });
    if (!result.ok) return pending(result.error);
    return { ok: true, status: "granted", externalRequestId: result.data.path };
  },

  async verifyAgencyAccess({ accessToken, asset }) {
    const config = requireGoogleOAuthConfig();
    if (!config.ok) return { ok: false, status: "agency_approval_pending", error: config.error };
    const ids = parse(asset);
    if (!ids) return { ok: false, status: "agency_approval_pending", error: "Not a Tag Manager container id." };
    const found = await findAgencyPermission(accessToken, ids[1], config.agencyEmail);
    if (!found.ok) return { ok: false, status: "agency_approval_pending", error: found.error };
    const access = found.permission?.containerAccess?.find((c) => c.containerId === ids[2]);
    return { ok: true, status: access && access.permission !== "noAccess" ? "granted" : "agency_approval_pending" };
  },

  async getConnectionHealth({ accessToken, tokenExpiry }) {
    if (!accessToken) return { health: "error", tokenValidityStatus: "invalid", detail: "No stored credential." };
    if (tokenExpiry && tokenExpiry.getTime() < Date.now()) return { health: "needs_attention", tokenValidityStatus: "expired", detail: "Access token expired and could not be refreshed." };
    const result = await googleRequest(`${API}/accounts`, accessToken);
    if (!result.ok) return { health: "error", tokenValidityStatus: "invalid", detail: result.error };
    return { health: "healthy", tokenValidityStatus: "valid" };
  },
};
