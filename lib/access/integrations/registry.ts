import { isDemoMode } from "@/lib/access/env";
import type { Phase1Platform } from "@/lib/access/types";
import type { PlatformAdapter } from "./types";
import { demoMetaAdsAdapter, demoInstagramAdapter, demoGoogleAdsAdapter } from "./demo";
import { metaAdsAdapter } from "./meta/adapter";
import { instagramAdapter } from "./instagram/adapter";
import { googleAdsAdapter } from "./google-ads/adapter";

const REAL_ADAPTERS: Record<Phase1Platform, PlatformAdapter> = {
  meta_ads: metaAdsAdapter,
  instagram: instagramAdapter,
  google_ads: googleAdsAdapter,
};

const DEMO_ADAPTERS: Record<Phase1Platform, PlatformAdapter> = {
  meta_ads: demoMetaAdsAdapter,
  instagram: demoInstagramAdapter,
  google_ads: demoGoogleAdsAdapter,
};

export function getAdapter(platform: Phase1Platform): PlatformAdapter {
  return isDemoMode() ? DEMO_ADAPTERS[platform] : REAL_ADAPTERS[platform];
}
