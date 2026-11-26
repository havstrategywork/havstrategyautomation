import { isDemoMode } from "@/lib/access/env";
import type { Platform } from "@/lib/access/types";
import type { PlatformAdapter } from "./types";
import { demoMetaAdsAdapter, demoInstagramAdapter, demoGoogleAdsAdapter, demoGoogleAnalyticsAdapter, demoGoogleTagManagerAdapter, demoShopifyAdapter } from "./demo";
import { metaAdsAdapter } from "./meta/adapter";
import { instagramAdapter } from "./instagram/adapter";
import { googleAdsAdapter } from "./google-ads/adapter";
import { googleAnalyticsAdapter } from "./google-analytics/adapter";
import { googleTagManagerAdapter } from "./google-tag-manager/adapter";
import { shopifyAdapter } from "./shopify/adapter";

const REAL_ADAPTERS: Record<Platform, PlatformAdapter> = {
  meta_ads: metaAdsAdapter,
  instagram: instagramAdapter,
  google_ads: googleAdsAdapter,
  google_analytics_4: googleAnalyticsAdapter,
  google_tag_manager: googleTagManagerAdapter,
  shopify: shopifyAdapter,
};

const DEMO_ADAPTERS: Record<Platform, PlatformAdapter> = {
  meta_ads: demoMetaAdsAdapter,
  instagram: demoInstagramAdapter,
  google_ads: demoGoogleAdsAdapter,
  google_analytics_4: demoGoogleAnalyticsAdapter,
  google_tag_manager: demoGoogleTagManagerAdapter,
  shopify: demoShopifyAdapter,
};

export function getAdapter(platform: Platform): PlatformAdapter {
  return isDemoMode() ? DEMO_ADAPTERS[platform] : REAL_ADAPTERS[platform];
}
