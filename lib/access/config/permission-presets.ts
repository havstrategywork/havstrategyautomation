import type { Phase1Platform, PermissionPreset } from "@/lib/access/types";

/**
 * Canonical, officially-supported scope names per platform (section 6).
 * These are the ONLY scopes the app will ever request - presets below
 * reference this list rather than inventing their own strings.
 *
 * Instagram has two distinct, non-interchangeable scope sets depending on
 * the connection method (see section 6B: "Do not mix permission scopes
 * between the Instagram Login and Facebook Login APIs"). The app picks the
 * method per-client based on how their account is connected - see
 * lib/integrations/instagram/.
 */
export const PLATFORM_SCOPES = {
  meta_ads: ["ads_read", "ads_management", "business_management", "pages_show_list", "pages_read_engagement"],
  instagram_via_facebook_login: [
    "instagram_basic",
    "instagram_manage_insights",
    "instagram_content_publish",
    "instagram_manage_comments",
    "instagram_manage_messages",
  ],
  instagram_via_instagram_login: [
    "instagram_business_basic",
    "instagram_business_manage_insights",
    "instagram_business_content_publish",
    "instagram_business_manage_comments",
    "instagram_business_manage_messages",
  ],
  // Google Ads exposes a single scope; read-only vs. management is an
  // application-level restriction we enforce ourselves, not a distinct
  // OAuth scope (section 6C).
  google_ads: ["https://www.googleapis.com/auth/adwords"],
} as const;

export type GoogleAdsAccessLevel = "read_only" | "manage_campaigns";

export interface PresetPlatformGrant {
  metaAdsScopes: readonly string[];
  instagramScopes: readonly string[];
  googleAdsScopes: readonly string[];
  googleAdsAccessLevel: GoogleAdsAccessLevel | null;
}

export interface PresetDefinition {
  key: PermissionPreset;
  label: string;
  description: string;
  grants: PresetPlatformGrant;
}

const NONE: PresetPlatformGrant = {
  metaAdsScopes: [],
  instagramScopes: [],
  googleAdsScopes: [],
  googleAdsAccessLevel: null,
};

export const PERMISSION_PRESET_DEFINITIONS: Record<Exclude<PermissionPreset, "custom">, PresetDefinition> = {
  analytics_only: {
    key: "analytics_only",
    label: "Analytics Only",
    description: "Read-only visibility into performance. We cannot change campaigns, budgets or content.",
    grants: {
      metaAdsScopes: ["ads_read", "business_management"],
      instagramScopes: ["instagram_basic", "instagram_manage_insights"],
      googleAdsScopes: [...PLATFORM_SCOPES.google_ads],
      googleAdsAccessLevel: "read_only",
    },
  },
  performance_marketing: {
    key: "performance_marketing",
    label: "Performance Marketing",
    description: "Run and optimize paid campaigns across ad accounts. No page or inbox management.",
    grants: {
      metaAdsScopes: ["ads_read", "ads_management", "business_management"],
      instagramScopes: ["instagram_basic", "instagram_manage_insights"],
      googleAdsScopes: [...PLATFORM_SCOPES.google_ads],
      googleAdsAccessLevel: "manage_campaigns",
    },
  },
  social_media_management: {
    key: "social_media_management",
    label: "Social Media Management",
    description: "Publish content, manage comments and the Page/Instagram inbox. No ad spend access.",
    grants: {
      metaAdsScopes: ["pages_show_list", "pages_read_engagement", "business_management"],
      instagramScopes: [
        "instagram_basic",
        "instagram_manage_insights",
        "instagram_content_publish",
        "instagram_manage_comments",
      ],
      googleAdsScopes: [],
      googleAdsAccessLevel: null,
    },
  },
  full_marketing_management: {
    key: "full_marketing_management",
    label: "Full Marketing Management",
    description:
      "Combines performance marketing and social media management across all requested platforms. Never includes account ownership, billing control or ownership transfer.",
    grants: {
      metaAdsScopes: [...PLATFORM_SCOPES.meta_ads],
      instagramScopes: [
        "instagram_basic",
        "instagram_manage_insights",
        "instagram_content_publish",
        "instagram_manage_comments",
      ],
      googleAdsScopes: [...PLATFORM_SCOPES.google_ads],
      googleAdsAccessLevel: "manage_campaigns",
    },
  },
};

export function resolvePresetGrants(preset: PermissionPreset, custom?: Record<string, string[]> | null): PresetPlatformGrant {
  if (preset === "custom") {
    return {
      metaAdsScopes: custom?.meta_ads ?? [],
      instagramScopes: custom?.instagram ?? [],
      googleAdsScopes: custom?.google_ads ?? [],
      googleAdsAccessLevel: custom?.google_ads?.length ? "manage_campaigns" : null,
    };
  }
  return PERMISSION_PRESET_DEFINITIONS[preset]?.grants ?? NONE;
}

export function scopesForPlatform(preset: PermissionPreset, platform: Phase1Platform, custom?: Record<string, string[]> | null): string[] {
  const grants = resolvePresetGrants(preset, custom);
  if (platform === "meta_ads") return [...grants.metaAdsScopes];
  if (platform === "instagram") return [...grants.instagramScopes];
  return [...grants.googleAdsScopes];
}
