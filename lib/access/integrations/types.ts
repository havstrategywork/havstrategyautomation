import type { AgencyAccessStatus, ConnectionHealth, Platform, TokenValidityStatus } from "@/lib/access/types";

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
 * One adapter per platform. Every method is safe to
 * call when the platform isn't configured in production - it returns
 * `{ ok: false, error }` rather than throwing, so a missing credential
 * degrades a single connection card, never the whole app.
 */
export interface PlatformAdapter {
  readonly platform: Platform;

  /** True when every env var this adapter needs in production is present. Always true for a demo adapter. */
  isConfigured(): boolean;

  // `account` is the provider-side account a connection belongs to when the API is addressed per account (Shopify: the store domain).
  initiateAuthorization(params: { state: string; redirectUri: string; scopes: string[]; account?: string | null }): { authorizationUrl: string };

  exchangeAuthorizationCode(params: { code: string; redirectUri: string; requestedScopes: string[]; account?: string | null; callbackParams?: URLSearchParams }): Promise<AuthorizationResult>;

  refreshAuthorization(params: { refreshToken: string; account?: string | null }): Promise<AuthorizationResult>;

  discoverAssets(params: { accessToken: string; account?: string | null }): Promise<DiscoverAssetsResult>;

  requestAgencyAccess(params: { accessToken: string; asset: DiscoveredAsset; account?: string | null; grantedScopes?: string[] }): Promise<AgencyAccessResult>;

  verifyAgencyAccess(params: { accessToken: string; asset: DiscoveredAsset; account?: string | null }): Promise<AgencyAccessResult>;

  verifyPermissions(params: { accessToken: string; assets: DiscoveredAsset[]; grantedScopes: string[] }): Promise<VerifyPermissionsResult>;

  revokeAuthorization(params: { accessToken: string; account?: string | null }): Promise<{ ok: boolean; error?: string }>;

  getConnectionHealth(params: { accessToken: string | null; tokenExpiry: Date | null; account?: string | null }): Promise<ConnectionHealthResult>;
}
