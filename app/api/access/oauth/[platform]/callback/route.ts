import { NextResponse } from "next/server";
import { withDb, isResponse } from "@/lib/access/api/guard";
import { handleOAuthCallback, redirectUriFor } from "@/lib/access/integrations/oauth-flow";
import { AGENCY_NONCE_COOKIE, verifyAgencyState, type AgencyState } from "@/lib/access/integrations/state";
import { exchangeGoogleCode } from "@/lib/access/integrations/google-ads/client";
import { saveAgencyAuthorization } from "@/lib/access/integrations/google-ads/agency";
import { logAudit } from "@/lib/access/audit";
import type { AnyDb } from "@/lib/access/db";
import { isPlatform } from "@/lib/access/types";
import { getAppUrl } from "@/lib/access/env";

/**
 * Stable callback path registered with each provider (section 15: strict
 * redirect URI allowlisting - this path never varies per client/invitation,
 * everything client-specific travels inside the signed `state` param).
 */
export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const appUrl = getAppUrl();
  if (!isPlatform(platform)) {
    return NextResponse.redirect(`${appUrl}/access/onboard-error?reason=unsupported_platform`);
  }

  const dbGuard = await withDb();
  if (isResponse(dbGuard)) return dbGuard;
  const { db } = dbGuard;

  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? undefined;
  const error = url.searchParams.get("error") ?? undefined;
  const state = url.searchParams.get("state") ?? undefined;
  const cookie = (name: string) =>
    req.headers
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1);

  // The agency connecting its own Google Ads manager account comes back to the same address as clients do.
  const agencyNonce = platform === "google_ads" ? cookie(AGENCY_NONCE_COOKIE) : undefined;
  const agency = agencyNonce && state ? await verifyAgencyState(state, agencyNonce) : null;
  if (agency) return finishAgencyConnection(db, agency, code);

  const nonceCookieName = `oauth_nonce_${platform}`;
  const outcome = await handleOAuthCallback(db, platform, { code, error, state, nonceCookie: cookie(nonceCookieName), query: url.searchParams });

  const response = NextResponse.redirect(outcome.redirectTo);
  // One-time use - always clear, whether the callback succeeded or not.
  response.cookies.set({ name: nonceCookieName, value: "", path: "/", maxAge: 0 });
  return response;
}

async function finishAgencyConnection(db: AnyDb, agency: AgencyState, code: string | undefined) {
  let result = "denied";
  if (code) {
    const tokens = await exchangeGoogleCode(code, redirectUriFor("google_ads"));
    if (!tokens.ok) result = "failed";
    else if (!tokens.data.refresh_token) result = "no_refresh_token";
    else {
      const saved = await saveAgencyAuthorization(db, { accessToken: tokens.data.access_token, refreshToken: tokens.data.refresh_token, connectedBy: agency.userName });
      result = saved.ok ? "connected" : saved.reason;
      if (!saved.ok) console.warn(`google ads: agency connection failed: ${saved.error}`);
      else await logAudit(db, { organizationId: agency.organizationId, actorId: agency.userId, actorType: "agency_user", action: "agency.google_ads_connected", platform: "google_ads" });
    }
  }
  // Not an HTTP redirect: we arrived from Google, and the browser would withhold the SameSite=Strict login cookie along that redirect chain.
  // A page of our own that navigates on is same-site, so the admin stays signed in. `result` is one of the fixed words above.
  const target = `${getAppUrl()}/access/integrations?google_ads=${result}`;
  const response = new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>Returning…</title><p><a href="${target}">Continue to the Access Hub</a></p>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
  response.cookies.set({ name: AGENCY_NONCE_COOKIE, value: "", path: "/", maxAge: 0 });
  return response;
}
