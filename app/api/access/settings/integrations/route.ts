import { NextResponse } from "next/server";
import { isResponse, withCapability } from "@/lib/access/api/guard";
import { getAppMode } from "@/lib/access/env";
import { PLATFORMS } from "@/lib/access/types";
import { PLATFORM_CATALOG } from "@/lib/access/integrations/catalog";
import { getAdapter } from "@/lib/access/integrations/registry";
import { getAgencyAuthorization } from "@/lib/access/integrations/google-ads/agency";

/** Never returns a secret value - only whether each integration is configured (section 15: never expose secrets to the frontend). */
export async function GET() {
  const guard = await withCapability("configure_integrations");
  if (isResponse(guard)) return guard;
  const { db } = guard;

  const mode = getAppMode();
  const integrations = PLATFORMS.map((platform) => ({
    ...PLATFORM_CATALOG[platform],
    configured: mode === "demo" ? true : getAdapter(platform).isConfigured(),
    mode,
  }));

  // Google Ads also needs the agency's own manager account connected (real mode only).
  const ads = integrations.find((i) => i.key === "google_ads")!;
  const googleAdsAgency = mode === "production" && ads.configured ? { connection: await getAgencyAuthorization(db) } : null;
  if (googleAdsAgency && !googleAdsAgency.connection) ads.configured = false;

  return NextResponse.json({ mode, integrations, googleAdsAgency });
}
