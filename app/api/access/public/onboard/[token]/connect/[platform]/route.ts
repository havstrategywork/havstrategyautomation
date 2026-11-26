import { NextResponse } from "next/server";
import { withDb, isResponse } from "@/lib/access/api/guard";
import { resolveInvitation } from "@/lib/access/public-onboarding";
import { startAuthorizationWithToken } from "@/lib/access/integrations/oauth-flow";
import { isPlatform } from "@/lib/access/types";
import { getAppUrl } from "@/lib/access/env";
import { rateLimit, clientIpFromHeaders } from "@/lib/access/rate-limit";

export async function GET(req: Request, { params }: { params: Promise<{ token: string; platform: string }> }) {
  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit(`onboard:connect:${ip}`, 30, 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const dbGuard = await withDb();
  if (isResponse(dbGuard)) return dbGuard;
  const { db } = dbGuard;
  const { token, platform } = await params;

  if (!isPlatform(platform)) {
    return NextResponse.redirect(`${getAppUrl()}/access/onboard/${token}?error=unsupported_platform`);
  }

  const resolved = await resolveInvitation(db, token);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { client } = resolved.value;

  const shop = new URL(req.url).searchParams.get("shop") ?? undefined;
  const result = await startAuthorizationWithToken(db, token, client.id, platform, shop);
  if (!result.ok) {
    return NextResponse.redirect(`${getAppUrl()}/access/onboard/${token}?platform=${platform}&status=error`);
  }

  const response = NextResponse.redirect(result.authorizationUrl);
  response.cookies.set({
    name: `oauth_nonce_${platform}`,
    value: result.nonce,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  });
  return response;
}
