import { NextResponse } from "next/server";
import { isResponse, withCapability } from "@/lib/access/api/guard";
import { getAppMode } from "@/lib/access/env";
import { PHASE_1_PLATFORMS } from "@/lib/access/types";
import { PLATFORM_CATALOG, PHASE_2_PLATFORM_LIST } from "@/lib/access/integrations/catalog";
import { getAdapter } from "@/lib/access/integrations/registry";

/** Never returns a secret value - only whether each integration is configured (section 15: never expose secrets to the frontend). */
export async function GET() {
  const guard = await withCapability("configure_integrations");
  if (isResponse(guard)) return guard;

  const mode = getAppMode();
  const phase1 = PHASE_1_PLATFORMS.map((platform) => ({
    ...PLATFORM_CATALOG[platform],
    configured: mode === "demo" ? true : getAdapter(platform).isConfigured(),
    mode,
  }));

  return NextResponse.json({ mode, phase1, phase2: PHASE_2_PLATFORM_LIST });
}
