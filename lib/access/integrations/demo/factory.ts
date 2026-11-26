import { generateSecureToken } from "@/lib/access/crypto/tokens";
import { getAppUrl } from "@/lib/access/env";
import type { Platform } from "@/lib/access/types";
import type { DiscoveredAsset, PlatformAdapter } from "../types";

/**
 * Builds a fully in-process, zero-network demo adapter. Shared across the
 * platforms so their simulated behavior (and its "never claim
 * simulated access is real" boundary) stays consistent - only the fake
 * asset catalog differs per platform, passed in by the caller.
 */
export function createDemoAdapter(platform: Platform, assetCatalog: DiscoveredAsset[]): PlatformAdapter {
  return {
    platform,
    isConfigured: () => true,

    initiateAuthorization({ state }) {
      // NextResponse.redirect() (the connect route's caller) requires an
      // absolute URL - this stands in for a real provider's own absolute
      // authorization URL.
      return { authorizationUrl: `${getAppUrl()}/access/onboard/demo-authorize/${platform}?state=${encodeURIComponent(state)}` };
    },

    async exchangeAuthorizationCode({ code, requestedScopes, account }) {
      if (code === "demo-approve-full") {
        return {
          ok: true,
          providerUserId: account ?? `demo-${platform}-${generateSecureToken(6)}`,
          accessToken: generateSecureToken(),
          refreshToken: generateSecureToken(),
          expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          grantedScopes: requestedScopes,
        };
      }
      if (code === "demo-approve-partial") {
        const grantedScopes = requestedScopes.slice(0, Math.max(1, Math.ceil(requestedScopes.length / 2)));
        return {
          ok: true,
          providerUserId: account ?? `demo-${platform}-${generateSecureToken(6)}`,
          accessToken: generateSecureToken(),
          refreshToken: generateSecureToken(),
          expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          grantedScopes,
        };
      }
      return { ok: false, denied: true, error: "Simulated authorization was not approved." };
    },

    async refreshAuthorization() {
      return {
        ok: true,
        accessToken: generateSecureToken(),
        refreshToken: generateSecureToken(),
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      };
    },

    async discoverAssets() {
      return { ok: true, assets: assetCatalog };
    },

    async requestAgencyAccess({ asset }) {
      return { ok: true, status: "agency_approval_pending", externalRequestId: `demo-req-${asset.externalAssetId}` };
    },

    async verifyAgencyAccess() {
      return { ok: true, status: "granted" };
    },

    async verifyPermissions({ assets, grantedScopes }) {
      // Simulates asking the provider "what is actually granted right now".
      // An asset's permissions are only as good as the overall OAuth grant -
      // so an earlier "approve limited access" choice genuinely narrows what
      // comes back here, rather than being silently treated as full access.
      return {
        ok: true,
        assets: assets.map((a) => {
          const grantedPermissions = a.availablePermissions.filter((p) => grantedScopes.includes(p));
          return { externalAssetId: a.externalAssetId, verified: grantedPermissions.length > 0, grantedPermissions };
        }),
      };
    },

    async revokeAuthorization() {
      return { ok: true };
    },

    async getConnectionHealth({ accessToken, tokenExpiry }) {
      if (!accessToken) return { health: "error", tokenValidityStatus: "invalid", detail: "No stored credential." };
      if (tokenExpiry && tokenExpiry.getTime() < Date.now()) {
        return { health: "needs_attention", tokenValidityStatus: "expired", detail: "Simulated token has expired." };
      }
      return { health: "healthy", tokenValidityStatus: "valid" };
    },
  };
}
