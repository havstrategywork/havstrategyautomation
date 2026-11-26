import { NextResponse } from "next/server";
import { isResponse, withCapability } from "@/lib/access/api/guard";
import { getAppMode, getAppUrl } from "@/lib/access/env";
import { AGENCY_NONCE_COOKIE, createAgencyState } from "@/lib/access/integrations/state";
import { redirectUriFor } from "@/lib/access/integrations/oauth-flow";
import { googleAdsAdapter } from "@/lib/access/integrations/google-ads/adapter";
import { removeAgencyAuthorization } from "@/lib/access/integrations/google-ads/agency";
import { PLATFORM_SCOPES } from "@/lib/access/config/permission-presets";
import { logAudit } from "@/lib/access/audit";

/** Admin only: start the agency's own Google Ads sign-in. It returns to the same callback address clients use, marked as the agency flow. */
export async function GET() {
  const guard = await withCapability("configure_integrations");
  if (isResponse(guard)) return guard;
  const { ctx } = guard;
  const back = `${getAppUrl()}/access/integrations`;
  if (getAppMode() === "demo" || !googleAdsAdapter.isConfigured()) return NextResponse.redirect(`${back}?google_ads=not_configured`);

  const { state, nonce } = await createAgencyState({ userId: ctx.userId, userName: ctx.name, organizationId: ctx.organizationId });
  const { authorizationUrl } = googleAdsAdapter.initiateAuthorization({ state, redirectUri: redirectUriFor("google_ads"), scopes: [...PLATFORM_SCOPES.google_ads] });
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set({ name: AGENCY_NONCE_COOKIE, value: nonce, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 15 * 60 });
  return response;
}

export async function DELETE() {
  const guard = await withCapability("configure_integrations");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  await removeAgencyAuthorization(db);
  await logAudit(db, { organizationId: ctx.organizationId, actorId: ctx.userId, actorType: "agency_user", action: "agency.google_ads_disconnected", platform: "google_ads" });
  return NextResponse.json({ ok: true });
}
