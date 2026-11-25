/** Thin fetch wrappers for Google OAuth token endpoints and the Google Ads API (REST). */

export function adsApiVersion(): string {
  return process.env.GOOGLE_ADS_API_VERSION?.trim() || "v18";
}

export function requireGoogleAdsConfig():
  | { ok: true; clientId: string; clientSecret: string; developerToken: string; managerCustomerId: string }
  | { ok: false; error: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const managerCustomerId = process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID;
  if (!clientId || !clientSecret || !developerToken || !managerCustomerId) {
    return { ok: false, error: "Google Ads integration is not fully configured (GOOGLE_CLIENT_ID/SECRET, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_MANAGER_CUSTOMER_ID)." };
  }
  return { ok: true, clientId, clientSecret, developerToken, managerCustomerId: managerCustomerId.replace(/-/g, "") };
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<{ ok: true; data: TokenResponse } | { ok: false; error: string; denied?: boolean }> {
  const config = requireGoogleAdsConfig();
  if (!config.ok) return { ok: false, error: config.error };

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  }).catch(() => null);

  if (!res) return { ok: false, error: "Google token endpoint request failed." };
  const data = (await res.json().catch(() => null)) as TokenResponse | null;
  if (!res.ok || !data) {
    const denied = data?.error === "invalid_grant" || /access_denied/i.test(data?.error ?? "");
    return { ok: false, denied, error: data?.error_description ?? `Google token endpoint returned ${res.status}` };
  }
  return { ok: true, data };
}

export async function refreshGoogleToken(refreshToken: string): Promise<{ ok: true; data: TokenResponse } | { ok: false; error: string }> {
  const config = requireGoogleAdsConfig();
  if (!config.ok) return { ok: false, error: config.error };

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }).toString(),
  }).catch(() => null);

  if (!res) return { ok: false, error: "Google token endpoint request failed." };
  const data = (await res.json().catch(() => null)) as TokenResponse | null;
  if (!res.ok || !data) return { ok: false, error: data?.error_description ?? `Google token endpoint returned ${res.status}` };
  return { ok: true, data };
}

/** Calls the Google Ads API REST surface. `loginCustomerId` should be the agency MCC id unless operating as the customer itself. */
export async function googleAdsRequest<T>(
  path: string,
  accessToken: string,
  init?: { method?: string; body?: unknown; loginCustomerId?: string },
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  const config = requireGoogleAdsConfig();
  if (!config.ok) return { ok: false, error: config.error };

  try {
    const res = await fetch(`https://googleads.googleapis.com/${adsApiVersion()}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": config.developerToken,
        "login-customer-id": init?.loginCustomerId ?? config.managerCustomerId,
        "Content-Type": "application/json",
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const message = json?.error?.message ?? `Google Ads API returned ${res.status}`;
      return { ok: false, error: message, status: res.status };
    }
    return { ok: true, data: json as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Google Ads API request failed." };
  }
}
