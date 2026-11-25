/**
 * Single source of truth for every status/role/platform vocabulary in the
 * app. Each is a `const` array (so Zod can build an enum from it and the UI
 * can iterate it) plus the TS union type derived from that array - never
 * define the same set of strings twice.
 */

export const ROLES = ["super_admin", "account_manager", "team_member"] as const;
export type Role = (typeof ROLES)[number];

export const PHASE_1_PLATFORMS = ["meta_ads", "instagram", "google_ads"] as const;
export type Phase1Platform = (typeof PHASE_1_PLATFORMS)[number];

export const PHASE_2_PLATFORMS = [
  "google_analytics_4",
  "google_merchant_center",
  "google_search_console",
  "google_tag_manager",
  "shopify",
  "youtube",
  "whatsapp_business",
  "klaviyo",
  "linkedin_ads",
  "pinterest_ads",
] as const;
export type Phase2Platform = (typeof PHASE_2_PLATFORMS)[number];

export const ALL_PLATFORMS = [...PHASE_1_PLATFORMS, ...PHASE_2_PLATFORMS] as const;
export type Platform = (typeof ALL_PLATFORMS)[number];

export const ONBOARDING_STATUSES = [
  "not_started",
  "invited",
  "in_progress",
  "completed",
  "archived",
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const PERMISSION_PRESETS = [
  "analytics_only",
  "performance_marketing",
  "social_media_management",
  "full_marketing_management",
  "custom",
] as const;
export type PermissionPreset = (typeof PERMISSION_PRESETS)[number];

export const OAUTH_AUTHORIZATION_STATUSES = [
  "not_requested",
  "invitation_sent",
  "authorization_started",
  "authorization_denied",
  "application_authorized",
  "authorization_expired",
  "access_revoked",
  "integration_error",
] as const;
export type OAuthAuthorizationStatus = (typeof OAUTH_AUTHORIZATION_STATUSES)[number];

export const TOKEN_VALIDITY_STATUSES = ["not_applicable", "valid", "expired", "invalid", "revoked"] as const;
export type TokenValidityStatus = (typeof TOKEN_VALIDITY_STATUSES)[number];

export const ASSET_SELECTION_STATUSES = ["not_required", "asset_selection_required", "completed"] as const;
export type AssetSelectionStatus = (typeof ASSET_SELECTION_STATUSES)[number];

export const AGENCY_ACCESS_STATUSES = [
  "not_applicable",
  "not_requested",
  "agency_approval_pending",
  "granted",
  "insufficient_permissions",
  "denied",
  "revoked",
] as const;
export type AgencyAccessStatus = (typeof AGENCY_ACCESS_STATUSES)[number];

export const CONNECTION_HEALTH_VALUES = ["healthy", "needs_attention", "error"] as const;
export type ConnectionHealth = (typeof CONNECTION_HEALTH_VALUES)[number];

export const ASSET_VERIFICATION_STATUSES = [
  "selected",
  "pending_agency_access",
  "verified",
  "insufficient_permissions",
  "revoked",
] as const;
export type AssetVerificationStatus = (typeof ASSET_VERIFICATION_STATUSES)[number];

export const ACCESS_REQUEST_STATUSES = [
  "pending",
  "approved",
  "denied",
  "expired",
  "manual_approval_required",
] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];

/**
 * Composite, UI-facing status - derived (never stored) from the four
 * separate fields above, for the single badge shown in tables/cards. This is
 * intentionally a superset naming match to the lifecycle states listed in
 * the spec's "Connection Status System" section.
 */
export const DISPLAY_CONNECTION_STATUSES = [
  "not_requested",
  "invitation_sent",
  "client_viewed",
  "authorization_started",
  "authorization_denied",
  "application_authorized",
  "asset_selection_required",
  "agency_approval_pending",
  "partially_connected",
  "connected_and_verified",
  "insufficient_permissions",
  "authorization_expired",
  "access_revoked",
  "disconnected",
  "integration_error",
] as const;
export type DisplayConnectionStatus = (typeof DISPLAY_CONNECTION_STATUSES)[number];

export const ACTOR_TYPES = ["agency_user", "client", "system"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["email", "in_app"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TYPES = [
  "new_invitation",
  "invitation_opened",
  "pending_platform_connection",
  "pending_partner_approval",
  "successful_connection",
  "incomplete_permissions",
  "expired_authorization",
  "revoked_access",
  "onboarding_completed",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const ANALYTICS_EVENT_TYPES = [
  "client_created",
  "onboarding_link_generated",
  "onboarding_link_opened",
  "platform_connect_clicked",
  "authorization_completed",
  "authorization_denied",
  "asset_selected",
  "agency_access_requested",
  "agency_access_verified",
  "platform_connected",
  "onboarding_completed",
  "onboarding_abandoned",
  "access_revoked",
] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export function isPhase1Platform(platform: string): platform is Phase1Platform {
  return (PHASE_1_PLATFORMS as readonly string[]).includes(platform);
}
