import { PLATFORMS, type Platform } from "@/lib/access/types";

export interface PlatformMeta {
  key: Platform;
  label: string;
  /** Plain-language copy for the client-facing onboarding card - no API jargon. */
  clientExplanation: string;
  officialDocsUrl: string;
  /** Set when the integration (or some of its endpoint/scope names) has not been verified against a live account. */
  requiresVerification?: string;
}

export const PLATFORM_CATALOG: Record<Platform, PlatformMeta> = {
  meta_ads: {
    key: "meta_ads",
    label: "Meta Ads",
    clientExplanation:
      "Lets our team see and manage the ad accounts you choose, so we can run and report on campaigns without ever seeing your password.",
    officialDocsUrl: "https://developers.facebook.com/docs/marketing-apis/",
  },
  instagram: {
    key: "instagram",
    label: "Instagram",
    clientExplanation:
      "Lets our team view your Instagram professional account's performance and, only if you allow it, publish content or manage comments and messages on your behalf.",
    officialDocsUrl: "https://developers.facebook.com/docs/instagram-platform/",
    requiresVerification:
      "Exact current scope names for the Instagram API with Instagram Login vs. Facebook Login depend on the account's connection method and Meta's current app-review requirements; confirm against live docs before production App Review submission.",
  },
  google_ads: {
    key: "google_ads",
    label: "Google Ads",
    clientExplanation:
      "Lets our team see your Google Ads account's performance and, once you approve the manager-account link, run and optimize campaigns.",
    officialDocsUrl: "https://developers.google.com/google-ads/api/docs/account-management/linking-manager-accounts",
    requiresVerification: "Not yet tried on a live account. Automatic access requests need at least Basic API access on your Google Cloud project.",
  },
  google_analytics_4: {
    key: "google_analytics_4",
    label: "Google Analytics 4",
    clientExplanation:
      "Adds our team to the Analytics properties you choose, so we can see how your site and campaigns perform (and configure measurement only if your plan includes it).",
    officialDocsUrl: "https://developers.google.com/analytics/devguides/config/admin/v1",
    requiresVerification: "Built to Google's Admin API reference but not yet tried on a live Analytics account; user management uses the v1alpha endpoint.",
  },
  google_tag_manager: {
    key: "google_tag_manager",
    label: "Google Tag Manager",
    clientExplanation:
      "Adds our team to the Tag Manager containers you choose, so we can check your tracking and, only if your plan includes it, edit and publish tags.",
    officialDocsUrl: "https://developers.google.com/tag-platform/tag-manager/api/reference/rest",
    requiresVerification: "Built to Google's Tag Manager API v2 reference but not yet tried on a live account.",
  },
  shopify: {
    key: "shopify",
    label: "Shopify",
    clientExplanation:
      "Installs our agency app on your store with only the permissions your plan needs, so we can report on sales and support your marketing. You can uninstall it at any time.",
    officialDocsUrl: "https://shopify.dev/docs/apps/build/authentication-authorization",
    requiresVerification: "Built to shopify.dev (expiring offline tokens) but not yet tried on a live store. Orders data may also need Shopify's protected customer data approval.",
  },
};

export const PLATFORM_LIST = PLATFORMS.map((key) => PLATFORM_CATALOG[key]);
