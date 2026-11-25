import { NextResponse } from "next/server";
import { withDb, isResponse } from "@/lib/access/api/guard";
import { handleOAuthCallback } from "@/lib/access/integrations/oauth-flow";
import { isPhase1Platform } from "@/lib/access/types";
import { getAppUrl } from "@/lib/access/env";

/**
 * Stable callback path registered with each provider (section 15: strict
 * redirect URI allowlisting - this path never varies per client/invitation,
 * everything client-specific travels inside the signed `state` param).
 */
export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const appUrl = getAppUrl();
  if (!isPhase1Platform(platform)) {
    return NextResponse.redirect(`${appUrl}/access/onboard-error?reason=unsupported_platform`);
  }

  const dbGuard = await withDb();
  if (isResponse(dbGuard)) return dbGuard;
  const { db } = dbGuard;

  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? undefined;
  const error = url.searchParams.get("error") ?? undefined;
  const state = url.searchParams.get("state") ?? undefined;
  const nonceCookieName = `oauth_nonce_${platform}`;
  const nonceCookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${nonceCookieName}=`))
    ?.slice(nonceCookieName.length + 1);

  const outcome = await handleOAuthCallback(db, platform, { code, error, state, nonceCookie });

  const response = NextResponse.redirect(outcome.redirectTo);
  // One-time use - always clear, whether the callback succeeded or not.
  response.cookies.set({ name: nonceCookieName, value: "", path: "/", maxAge: 0 });
  return response;
}
