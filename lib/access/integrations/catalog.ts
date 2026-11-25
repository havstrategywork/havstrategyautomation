import { PHASE_1_PLATFORMS, PHASE_2_PLATFORMS, type Platform } from "@/lib/access/types";

export interface PlatformMeta {
  key: Platform;
  label: string;
  phase: 1 | 2;
  /** Plain-language copy for the client-facing onboarding card - no API jargon. */
  clientExplanation: string;
  officialDocsUrl: string;
  /** Set when the exact current scope/endpoint names could not be verified against live docs - see section 23 of the spec. */
  requiresVerification?: string;
}

export const PLATFORM_CATALOG: Record<Platform, PlatformMeta> = {
  meta_ads: {
    key: "meta_ads",
    label: "Meta Ads",
    phase: 1,
    clientExplanation:
      "Lets our team see and manage the ad accounts you choose, so we can run and report on campaigns without ever seeing your password.",
    officialDocsUrl: "https://developers.facebook.com/docs/marketing-apis/",
  },
  instagram: {
    key: "instagram",
    label: "Instagram",
    phase: 1,
    clientExplanation:
      "Lets our team view your Instagram professional account's performance and, only if you allow it, publish content or manage comments and messages on your behalf.",
    officialDocsUrl: "https://developers.facebook.com/docs/instagram-platform/",
    requiresVerification:
      "Exact current scope names for the Instagram API with Instagram Login vs. Facebook Login depend on the account's connection method and Meta's current app-review requirements; confirm against live docs before production App Review submission.",
  },
  google_ads: {
    key: "google_ads",
    label: "Google Ads",
    phase: 1,
    clientExplanation:
      "Lets our team see your Google Ads account's performance and, once you approve the manager-account link, run and optimize campaigns.",
    officialDocsUrl: "https://developers.google.com/google-ads/api/docs/oauth/overview",
  },
  google_analytics_4: phase2("google_analytics_4", "Google Analytics 4", "https://developers.google.com/analytics"),
  google_merchant_center: phase2("google_merchant_center", "Google Merchant Center", "https://developers.google.com/shopping-content"),
  google_search_console: phase2("google_search_console", "Google Search Console", "https://developers.google.com/webmaster-tools"),
  google_tag_manager: phase2("google_tag_manager", "Google Tag Manager", "https://developers.google.com/tag-platform/tag-manager"),
  shopify: phase2("shopify", "Shopify", "https://shopify.dev/docs/api"),
  youtube: phase2("youtube", "YouTube", "https://developers.google.com/youtube"),
  whatsapp_business: phase2("whatsapp_business", "WhatsApp Business", "https://developers.facebook.com/docs/whatsapp"),
  klaviyo: phase2("klaviyo", "Klaviyo", "https://developers.klaviyo.com"),
  linkedin_ads: phase2("linkedin_ads", "LinkedIn Ads", "https://learn.microsoft.com/en-us/linkedin/marketing"),
  pinterest_ads: phase2("pinterest_ads", "Pinterest Ads", "https://developers.pinterest.com/docs/api/v5/"),
};

function phase2(key: Platform, label: string, officialDocsUrl: string): PlatformMeta {
  return {
    key,
    label,
    phase: 2,
    clientExplanation: `${label} support is planned for a future release.`,
    officialDocsUrl,
  };
}

export const PHASE_1_PLATFORM_LIST = PHASE_1_PLATFORMS.map((key) => PLATFORM_CATALOG[key]);
export const PHASE_2_PLATFORM_LIST = PHASE_2_PLATFORMS.map((key) => PLATFORM_CATALOG[key]);
