import type { AnyDb } from "@/lib/access/db";
import { getAdapter } from "./registry";
import { getFreshAccessToken } from "./fresh-token";
import { normalizeShopDomain } from "./shopify/shop";
import { createOAuthState, verifyOAuthState } from "./state";
import { encryptSecret } from "@/lib/access/crypto/tokens";
import { getAppUrl } from "@/lib/access/env";
import { logAudit, trackEvent } from "@/lib/access/audit";
import { notify } from "@/lib/access/notifications";
import { getClientById, getClientByIdTrusted, recomputeOnboardingStatus } from "@/lib/access/db/queries/clients";
import { getInvitationByRawToken, getLatestInvitationForClient, markInvitationCompleted } from "@/lib/access/db/queries/invitations";
import {
  getConnection,
  getConnectionById,
  replaceSelectedAssets,
  updateAssetVerification,
  updateConnectionStatus,
  upsertCredentials,
  deleteCredentials,
  createAccessRequest,
  listAssetsForConnection,
  listConnectionsForClient,
} from "@/lib/access/db/queries/connections";
import { listOrganizationMembers } from "@/lib/access/db/queries/users";
import { scopesForPlatform } from "@/lib/access/config/permission-presets";
import { PLATFORM_CATALOG } from "./catalog";
import type { Platform, PermissionPreset } from "@/lib/access/types";
import type { DiscoveredAsset } from "./types";

function presetOf(client: { permissionPreset: string | null }): PermissionPreset {
  return (client.permissionPreset ?? "custom") as PermissionPreset;
}

export function redirectUriFor(platform: Platform): string {
  return `${getAppUrl()}/api/access/oauth/${platform}/callback`;
}

/**
 * The invitation token itself is never persisted anywhere in recoverable
 * form (only its hash) by design - see lib/db/queries/invitations.ts - so
 * this always takes the raw token from the caller's own request (the
 * onboarding page's URL), rather than looking it up.
 */
export async function startAuthorizationWithToken(db: AnyDb, rawToken: string, clientId: string, platform: Platform, shopInput?: string) {
  const connection = await getConnection(db, clientId, platform);
  if (!connection) return { ok: false as const, error: "No connection record for this platform." };
  const client = await getClientById(db, connection.organizationId, clientId);
  if (!client) return { ok: false as const, error: "Client not found." };

  const scopes = scopesForPlatform(presetOf(client), platform, client.customPermissions);
  const adapter = getAdapter(platform);

  // Shopify authorizes one store at a time, so its domain is needed before the redirect.
  const account = platform === "shopify" ? normalizeShopDomain(shopInput ?? "") ?? undefined : undefined;
  if (platform === "shopify" && !account) return { ok: false as const, error: "Enter your store's myshopify.com domain." };
  if (scopes.length === 0) return { ok: false as const, error: `No ${PLATFORM_CATALOG[platform].label} permissions are included in this client's plan.` };

  if (!adapter.isConfigured()) {
    await updateConnectionStatus(db, connection.id, { oauthAuthorizationStatus: "integration_error", connectionHealth: "error", errorMessage: `${PLATFORM_CATALOG[platform].label} is not configured on this server.` });
    return { ok: false as const, error: `${PLATFORM_CATALOG[platform].label} is not configured in this environment.` };
  }

  const { state, nonce } = await createOAuthState(rawToken, platform, scopes, account);
  const { authorizationUrl } = adapter.initiateAuthorization({ state, redirectUri: redirectUriFor(platform), scopes, account });

  await updateConnectionStatus(db, connection.id, { oauthAuthorizationStatus: "authorization_started" });
  await logAudit(db, { organizationId: connection.organizationId, clientId, actorType: "client", action: "oauth.authorization_started", platform });
  await trackEvent(db, { organizationId: connection.organizationId, clientId, eventType: "platform_connect_clicked", platform });

  return { ok: true as const, authorizationUrl, nonce };
}

export interface CallbackOutcome {
  redirectTo: string;
}

export async function handleOAuthCallback(
  db: AnyDb,
  platform: Platform,
  params: { code?: string; error?: string; state?: string; nonceCookie?: string; query?: URLSearchParams },
): Promise<CallbackOutcome> {
  const appUrl = getAppUrl();

  if (!params.state || !params.nonceCookie) {
    return { redirectTo: `${appUrl}/access/onboard-error?reason=missing_state` };
  }

  const verified = await verifyOAuthState(params.state, params.nonceCookie);
  if (!verified.ok || verified.value.platform !== platform) {
    return { redirectTo: `${appUrl}/access/onboard-error?reason=invalid_state` };
  }

  const { invitationToken, scopes, account } = verified.value;
  const invitation = await getInvitationByRawToken(db, invitationToken);
  if (!invitation) return { redirectTo: `${appUrl}/access/onboard-error?reason=invitation_not_found` };

  const client = await getClientByIdTrusted(db, invitation.clientId); // the id comes from the invitation token's own record
  if (!client) return { redirectTo: `${appUrl}/access/onboard-error?reason=client_not_found` };

  const connection = await getConnection(db, client.id, platform);
  if (!connection) return { redirectTo: `${appUrl}/access/onboard/${invitationToken}?platform=${platform}&status=error` };

  if (params.error) {
    await updateConnectionStatus(db, connection.id, { oauthAuthorizationStatus: "authorization_denied", connectionHealth: "error", errorMessage: "Client denied the requested permissions during authorization." });
    await logAudit(db, { organizationId: client.organizationId, clientId: client.id, actorType: "client", action: "oauth.denied", platform });
    await trackEvent(db, { organizationId: client.organizationId, clientId: client.id, eventType: "authorization_denied", platform });
    return { redirectTo: `${appUrl}/access/onboard/${invitationToken}?platform=${platform}&status=denied` };
  }

  if (!params.code) {
    return { redirectTo: `${appUrl}/access/onboard/${invitationToken}?platform=${platform}&status=error` };
  }

  const adapter = getAdapter(platform);
  const result = await adapter.exchangeAuthorizationCode({ code: params.code, redirectUri: redirectUriFor(platform), requestedScopes: scopes, account, callbackParams: params.query });

  if (!result.ok) {
    if (result.denied) {
      await updateConnectionStatus(db, connection.id, { oauthAuthorizationStatus: "authorization_denied", connectionHealth: "error", errorMessage: "Client denied the requested permissions during authorization." });
      await logAudit(db, { organizationId: client.organizationId, clientId: client.id, actorType: "client", action: "oauth.denied", platform });
      await trackEvent(db, { organizationId: client.organizationId, clientId: client.id, eventType: "authorization_denied", platform });
      return { redirectTo: `${appUrl}/access/onboard/${invitationToken}?platform=${platform}&status=denied` };
    }
    await updateConnectionStatus(db, connection.id, { oauthAuthorizationStatus: "integration_error", connectionHealth: "error", errorMessage: result.error ?? "Authorization failed." });
    await logAudit(db, { organizationId: client.organizationId, clientId: client.id, actorType: "system", action: "oauth.error", platform, metadata: { error: result.error } });
    return { redirectTo: `${appUrl}/access/onboard/${invitationToken}?platform=${platform}&status=error` };
  }

  const encryptedAccess = result.accessToken ? encryptSecret(result.accessToken) : null;
  const encryptedRefresh = result.refreshToken ? encryptSecret(result.refreshToken) : null;
  if (encryptedAccess && !encryptedAccess.ok) {
    await updateConnectionStatus(db, connection.id, { oauthAuthorizationStatus: "integration_error", connectionHealth: "error", errorMessage: encryptedAccess.error });
    return { redirectTo: `${appUrl}/access/onboard/${invitationToken}?platform=${platform}&status=error` };
  }

  await upsertCredentials(db, connection.id, {
    encryptedAccessToken: encryptedAccess && encryptedAccess.ok ? encryptedAccess.value : null,
    encryptedRefreshToken: encryptedRefresh && encryptedRefresh.ok ? encryptedRefresh.value : null,
    expiresAt: result.expiresAt ?? null,
  });

  await updateConnectionStatus(db, connection.id, {
    providerUserId: result.providerUserId ?? null,
    oauthAuthorizationStatus: "application_authorized",
    tokenValidityStatus: "valid",
    assetSelectionStatus: "asset_selection_required",
    grantedScopes: result.grantedScopes ?? scopes,
    tokenExpiry: result.expiresAt ?? null,
    connectionHealth: "needs_attention", // still needs asset selection + verification before it's truly healthy
    errorMessage: null,
  });

  await recomputeOnboardingStatus(db, client.id);
  await logAudit(db, { organizationId: client.organizationId, clientId: client.id, actorType: "client", action: "oauth.authorized", platform });
  await trackEvent(db, { organizationId: client.organizationId, clientId: client.id, eventType: "authorization_completed", platform });

  return { redirectTo: `${appUrl}/access/onboard/${invitationToken}?platform=${platform}&status=authorized` };
}

export async function discoverAssetsForConnection(db: AnyDb, connectionId: string) {
  const connection = await getConnectionById(db, connectionId);
  if (!connection) return { ok: false as const, error: "Connection not found." };
  const token = await getFreshAccessToken(db, connection);
  if (!token.ok) return { ok: false as const, error: token.error };

  const adapter = getAdapter(connection.platform as Platform);
  return adapter.discoverAssets({ accessToken: token.accessToken, account: connection.providerUserId });
}

export async function completeAssetSelection(
  db: AnyDb,
  connectionId: string,
  selected: DiscoveredAsset[],
) {
  const connection = await getConnectionById(db, connectionId);
  if (!connection) return { ok: false as const, error: "Connection not found." };
  const client = await getClientById(db, connection.organizationId, connection.clientId);
  if (!client) return { ok: false as const, error: "Client not found." };
  const token = await getFreshAccessToken(db, connection);
  if (!token.ok) return { ok: false as const, error: token.error };

  const platform = connection.platform as Platform;
  const adapter = getAdapter(platform);

  await replaceSelectedAssets(db, connectionId, selected.map((a) => ({ externalAssetId: a.externalAssetId, assetName: a.assetName, assetType: a.assetType, grantedPermissions: a.availablePermissions })));
  await updateConnectionStatus(db, connectionId, { assetSelectionStatus: "completed" });
  await logAudit(db, { organizationId: connection.organizationId, clientId: connection.clientId, actorType: "client", action: "assets.selected", platform, metadata: { count: selected.length } });
  await trackEvent(db, { organizationId: connection.organizationId, clientId: connection.clientId, eventType: "asset_selected", platform });

  let anyPending = false;
  let anyDenied = false;
  let guidance: string | undefined; // what the client has to do by hand when automatic access didn't go through
  for (const asset of selected) {
    const requestResult = await adapter.requestAgencyAccess({ accessToken: token.accessToken, asset, account: connection.providerUserId, grantedScopes: connection.grantedScopes });
    await createAccessRequest(db, { connectionId, requestedPermissions: asset.availablePermissions, requestStatus: requestResult.status === "granted" ? "approved" : "pending", externalRequestId: requestResult.externalRequestId });
    if (requestResult.status === "denied") anyDenied = true;
    if (requestResult.status === "agency_approval_pending") guidance ??= requestResult.error;
    if (requestResult.status === "agency_approval_pending") anyPending = true;
  }
  await trackEvent(db, { organizationId: connection.organizationId, clientId: connection.clientId, eventType: "agency_access_requested", platform });

  const verification = await reverifyConnectionAssets(db, connectionId, token.accessToken, selected);
  if (guidance && verification?.agencyAccessStatus === "agency_approval_pending") await updateConnectionStatus(db, connectionId, { errorMessage: guidance });

  return { ok: true as const, anyPending, anyDenied, verification };
}

/**
 * Brings the client's status up to date and, the first time every requested platform is granted, closes the invitation and tells the team.
 * Approval can arrive long after the client picked their accounts (e.g. a Google Ads manager link), so this runs after every verification.
 */
async function finishOnboardingIfDone(db: AnyDb, organizationId: string, clientId: string) {
  await recomputeOnboardingStatus(db, clientId);
  const client = await getClientById(db, organizationId, clientId);
  if (!client || client.archivedAt) return;
  const latestInvitation = await getLatestInvitationForClient(db, clientId);
  if (!latestInvitation || latestInvitation.completedAt) return;
  const connections = await listConnectionsForClient(db, clientId);
  const allDone = client.requiredPlatforms.every((p) => {
    const c = connections.find((c) => c.platform === p);
    return c?.agencyAccessStatus === "granted" && c.assetSelectionStatus === "completed";
  });
  if (!allDone) return;
  await markInvitationCompleted(db, latestInvitation.id);
  const members = await listOrganizationMembers(db, organizationId);
  await notify(db, {
    organizationId,
    clientId,
    type: "onboarding_completed",
    recipients: members.map((m) => ({ kind: "agency_user" as const, userId: m.userId, email: m.email })),
    context: { brandName: client.brandName },
  });
  await trackEvent(db, { organizationId, clientId, eventType: "onboarding_completed" });
}

async function reverifyConnectionAssets(db: AnyDb, connectionId: string, accessToken: string, assets: DiscoveredAsset[]) {
  const connection = await getConnectionById(db, connectionId);
  if (!connection) return null;
  const client = await getClientById(db, connection.organizationId, connection.clientId);
  const platform = connection.platform as Platform;
  const adapter = getAdapter(platform);

  const agencyResults = await Promise.all(assets.map((asset) => adapter.verifyAgencyAccess({ accessToken, asset, account: connection.providerUserId })));
  const permissionResult = await adapter.verifyPermissions({ accessToken, assets, grantedScopes: connection.grantedScopes as string[] });

  const requiredScopes = client ? scopesForPlatform(presetOf(client), platform, client.customPermissions) : [];
  const storedAssets = await listAssetsForConnection(db, connectionId);

  const overallGranted = agencyResults.every((r) => r.status === "granted");
  let overallInsufficient = false;

  for (const stored of storedAssets) {
    const permInfo = permissionResult.ok ? permissionResult.assets.find((a) => a.externalAssetId === stored.externalAssetId) : undefined;
    // Only scopes relevant to THIS asset's own capabilities count against it -
    // e.g. a Page was never going to have "ads_management", so its absence
    // there must never flag the connection as insufficient.
    const assetCapabilities = stored.grantedPermissions as string[];
    const scopesRelevantToThisAsset = requiredScopes.filter((s) => assetCapabilities.includes(s));
    const missingRequired = scopesRelevantToThisAsset.length > 0 && permInfo ? scopesRelevantToThisAsset.some((s) => !permInfo.grantedPermissions.includes(s)) : false;

    // If nothing the current plan needs is even relevant to this asset type
    // (e.g. no page scopes were requested at all), there's nothing to verify
    // against it - it's trivially fine, not "pending" forever.
    const nothingRequiredHere = scopesRelevantToThisAsset.length === 0;

    if (missingRequired) {
      overallInsufficient = true;
      await updateAssetVerification(db, stored.id, "insufficient_permissions");
    } else if (overallGranted && (permInfo?.verified || nothingRequiredHere)) {
      await updateAssetVerification(db, stored.id, "verified", new Date());
    } else {
      await updateAssetVerification(db, stored.id, "pending_agency_access");
    }
  }

  const agencyAccessStatus = overallInsufficient ? "insufficient_permissions" : overallGranted ? "granted" : "agency_approval_pending";
  const connectionHealth = overallInsufficient ? "needs_attention" : overallGranted ? "healthy" : "needs_attention";

  await updateConnectionStatus(db, connectionId, {
    agencyAccessStatus,
    connectionHealth,
    lastVerifiedAt: new Date(),
    // While approval is pending, keep (or refresh) the instructions telling the client what to do; clear them once it's resolved.
    errorMessage: overallInsufficient ? "Granted permissions do not fully cover what this client's plan requires." : overallGranted ? null : agencyResults.find((r) => r.status === "agency_approval_pending" && r.error)?.error,
  });

  if (client) {
    await logAudit(db, { organizationId: connection.organizationId, clientId: client.id, actorType: "system", action: overallInsufficient ? "agency_access.insufficient" : "agency_access.verified", platform });
    await trackEvent(db, { organizationId: connection.organizationId, clientId: client.id, eventType: "agency_access_verified", platform });

    if (overallGranted && !overallInsufficient) {
      await trackEvent(db, { organizationId: connection.organizationId, clientId: client.id, eventType: "platform_connected", platform });
    }
  }

  await finishOnboardingIfDone(db, connection.organizationId, connection.clientId);

  return { agencyAccessStatus, connectionHealth };
}

export { reverifyConnectionAssets };

/**
 * Disconnects a single platform connection: revokes the application
 * authorization with the provider (where supported) and deletes the stored
 * credential. This is distinct from removing agency partner/MCC access
 * alone (section 16) - that narrower action would only touch
 * agencyAccessStatus and leave the OAuth application authorization intact;
 * this always does both, since the UI only ever exposes one "Disconnect".
 */
export async function disconnectConnection(db: AnyDb, connectionId: string, actor: { actorId: string | null; actorType: "agency_user" | "client" }) {
  const connection = await getConnectionById(db, connectionId);
  if (!connection) return { ok: false as const, error: "Connection not found." };

  const token = await getFreshAccessToken(db, connection);
  if (token.ok) {
    const adapter = getAdapter(connection.platform as Platform);
    await adapter.revokeAuthorization({ accessToken: token.accessToken, account: connection.providerUserId }).catch(() => null);
  }
  await deleteCredentials(db, connectionId);

  await updateConnectionStatus(db, connectionId, {
    oauthAuthorizationStatus: "access_revoked",
    tokenValidityStatus: "revoked",
    agencyAccessStatus: "revoked",
    tokenReference: null,
  });

  const assets = await listAssetsForConnection(db, connectionId);
  for (const asset of assets) await updateAssetVerification(db, asset.id, "revoked");

  const client = await getClientById(db, connection.organizationId, connection.clientId);
  await logAudit(db, { organizationId: connection.organizationId, clientId: connection.clientId, actorId: actor.actorId, actorType: actor.actorType, action: "access.revoked", platform: connection.platform });
  await trackEvent(db, { organizationId: connection.organizationId, clientId: connection.clientId, eventType: "access_revoked", platform: connection.platform });

  if (client) {
    await recomputeOnboardingStatus(db, client.id);
    const members = await listOrganizationMembers(db, connection.organizationId);
    await notify(db, {
      organizationId: connection.organizationId,
      clientId: client.id,
      type: "revoked_access",
      recipients: members.map((m) => ({ kind: "agency_user" as const, userId: m.userId, email: m.email })),
      context: { brandName: client.brandName, platformLabel: PLATFORM_CATALOG[connection.platform as Platform]?.label },
    });
  }

  return { ok: true as const };
}
