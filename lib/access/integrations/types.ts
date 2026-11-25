import type { AgencyAccessStatus, ConnectionHealth, Phase1Platform, TokenValidityStatus } from "@/lib/access/types";

export interface DiscoveredAsset {
  externalAssetId: string;
  assetName: string;
  assetType: string;
  availablePermissions: string[];
}

export interface AuthorizationResult {
  ok: boolean;
  providerUserId?: string;
  accessToken?: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  grantedScopes?: string[];
  /** True when the provider's response indicates the end-user denied the request (not a transport/config error). */
  denied?: boolean;
  error?: string;
}

export interface AgencyAccessResult {
  ok: boolean;
  status: AgencyAccessStatus;
  externalRequestId?: string;
  error?: string;
}

export interface VerifyPermissionsResult {
  ok: boolean;
  assets: { externalAssetId: string; verified: boolean; grantedPermissions: string[] }[];
  error?: string;
}

export interface ConnectionHealthResult {
  health: ConnectionHealth;
  tokenValidityStatus: TokenValidityStatus;
  detail?: string;
}

export interface DiscoverAssetsResult {
  ok: boolean;
  assets: DiscoveredAsset[];
  error?: string;
}

/**
 * One adapter per Phase 1 platform (section 13). Every method is safe to
 * call when the platform isn't configured in production - it returns
 * `{ ok: false, error }` rather than throwing, so a missing credential
 * degrades a single connection card, never the whole app.
 */
export interface PlatformAdapter {
  readonly platform: Phase1Platform;

  /** True when every env var this adapter needs in production is present. Always true for a demo adapter. */
  isConfigured(): boolean;

  initiateAuthorization(params: { state: string; redirectUri: string; scopes: string[] }): { authorizationUrl: string };

  exchangeAuthorizationCode(params: { code: string; redirectUri: string; requestedScopes: string[] }): Promise<AuthorizationResult>;

  refreshAuthorization(params: { refreshToken: string }): Promise<AuthorizationResult>;

  discoverAssets(params: { accessToken: string }): Promise<DiscoverAssetsResult>;

  requestAgencyAccess(params: { accessToken: string; asset: DiscoveredAsset }): Promise<AgencyAccessResult>;

  verifyAgencyAccess(params: { accessToken: string; asset: DiscoveredAsset }): Promise<AgencyAccessResult>;

  verifyPermissions(params: { accessToken: string; assets: DiscoveredAsset[]; grantedScopes: string[] }): Promise<VerifyPermissionsResult>;

  revokeAuthorization(params: { accessToken: string }): Promise<{ ok: boolean; error?: string }>;

  getConnectionHealth(params: { accessToken: string | null; tokenExpiry: Date | null }): Promise<ConnectionHealthResult>;
}
