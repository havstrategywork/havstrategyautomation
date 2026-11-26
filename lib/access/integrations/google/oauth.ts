import type { PlatformAdapter } from "../types";

/**
 * OAuth + REST plumbing shared by the Google Analytics 4 and Google Tag Manager adapters (Google Ads has its own client, which also needs a
 * developer token). Both reuse the same Google OAuth client; "agency access" means adding the agency's Google account (GOOGLE_AGENCY_EMAIL)
 * as a user on the client's GA4 property / GTM container, using the client's own authorization.
 */
export function requireGoogleOAuthConfig(): { ok: true; clientId: string; clientSecret: string; agencyEmail: string } | { ok: false; error: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const agencyEmail = process.env.GOOGLE_AGENCY_EMAIL?.trim().toLowerCase();
  if (!clientId || !clientSecret || !agencyEmail) {
    return { ok: false, error: "Google integration is not fully configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_AGENCY_EMAIL)." };
  }
  return { ok: true, clientId, clientSecret, agencyEmail };
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<{ ok: true; data: TokenResponse } | { ok: false; error: string; denied?: boolean }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  }).catch(() => null);
  if (!res) return { ok: false, error: "Google token endpoint request failed." };
  const data = (await res.json().catch(() => null)) as TokenResponse | null;
  if (!res.ok || !data?.access_token) {
    return { ok: false, denied: /access_denied/i.test(data?.error ?? ""), error: data?.error_description ?? `Google token endpoint returned ${res.status}` };
  }
  return { ok: true, data };
}

export async function googleRequest<T>(
  url: string,
  accessToken: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: json?.error?.message ?? `Google API returned ${res.status}`, status: res.status };
    return { ok: true, data: (json ?? {}) as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Google API request failed." };
  }
}

/** The adapter methods that are identical for every Google product: authorize, exchange, refresh, permission check, revoke. */
export const googleOAuthMethods: Pick<
  PlatformAdapter,
  "isConfigured" | "initiateAuthorization" | "exchangeAuthorizationCode" | "refreshAuthorization" | "verifyPermissions" | "revokeAuthorization"
> = {
  isConfigured: () => requireGoogleOAuthConfig().ok,

  initiateAuthorization({ state, redirectUri, scopes }) {
    const config = requireGoogleOAuthConfig();
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

  async exchangeAuthorizationCode({ code, redirectUri, requestedScopes }) {
    const config = requireGoogleOAuthConfig();
    if (!config.ok) return { ok: false, error: config.error };
    const result = await tokenRequest({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" });
    if (!result.ok) return { ok: false, denied: result.denied, error: result.error };
    return {
      ok: true,
      accessToken: result.data.access_token,
      refreshToken: result.data.refresh_token ?? null,
      expiresAt: new Date(Date.now() + result.data.expires_in * 1000),
      // Google lets the user untick individual scopes, so record what was actually granted.
      grantedScopes: result.data.scope ? result.data.scope.split(" ") : requestedScopes,
    };
  },

  async refreshAuthorization({ refreshToken }) {
    const config = requireGoogleOAuthConfig();
    if (!config.ok) return { ok: false, error: config.error };
    const result = await tokenRequest({ refresh_token: refreshToken, client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token" });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, accessToken: result.data.access_token, refreshToken, expiresAt: new Date(Date.now() + result.data.expires_in * 1000) };
  },

  async verifyPermissions({ assets, grantedScopes }) {
    return {
      ok: true,
      assets: assets.map((a) => {
        const grantedPermissions = a.availablePermissions.filter((p) => grantedScopes.includes(p));
        return { externalAssetId: a.externalAssetId, verified: grantedPermissions.length > 0, grantedPermissions };
      }),
    };
  },

  async revokeAuthorization({ accessToken }) {
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
};
