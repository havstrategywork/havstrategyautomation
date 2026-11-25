import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Canonical schema (section 14 of the spec), targeted at Postgres (Supabase
 * in production, PGlite - a real embedded Postgres - in demo mode) via
 * Drizzle. IDs are generated in application code with crypto.randomUUID()
 * rather than a DB-side default so no Postgres extension (pgcrypto/uuid-ossp)
 * is required - this keeps the schema portable between PGlite and any plain
 * Postgres instance with zero setup.
 *
 * Status/role/platform columns are plain text validated at the application
 * boundary (lib/validation) rather than Postgres ENUMs, so new values (e.g.
 * a Phase 2 platform) never require a destructive type migration.
 */

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey(),
  organizationName: text("organization_name").notNull(),
  logoUrl: text("logo_url"),
  // Branding + feature config: { primaryColor?, supportEmail?, supportUrl? }
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  // Nullable: a user created via an external identity provider (future
  // Supabase Auth migration) may have no local password.
  passwordHash: text("password_hash"),
  // Reserved for a future external auth provider's subject id.
  authenticationUserId: text("authentication_user_id"),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailUnique: uniqueIndex("users_email_unique").on(table.email),
}));

/** Role: 'super_admin' | 'account_manager' | 'team_member' */
export const organizationMemberships = pgTable("organization_memberships", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgUserUnique: uniqueIndex("org_memberships_org_user_unique").on(table.organizationId, table.userId),
  userIdx: index("org_memberships_user_idx").on(table.userId),
}));

/** Sessions for agency-user logins. Opaque token; only its SHA-256 hash is stored. */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => ({
  tokenHashUnique: uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
  userIdx: index("sessions_user_idx").on(table.userId),
}));

/**
 * onboarding_status: 'not_started' | 'invited' | 'in_progress' | 'completed' | 'archived'
 * permissionPreset: 'analytics_only' | 'performance_marketing' | 'social_media_management'
 *                  | 'full_marketing_management' | 'custom'
 * requiredPlatforms: string[] of platform keys, e.g. ["meta_ads","instagram","google_ads"]
 */
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  brandName: text("brand_name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  website: text("website"),
  industry: text("industry"),
  logoUrl: text("logo_url"),
  assignedManagerId: uuid("assigned_manager_id").references(() => users.id, { onDelete: "set null" }),
  onboardingStatus: text("onboarding_status").notNull().default("not_started"),
  requiredPlatforms: jsonb("required_platforms").$type<string[]>().notNull().default([]),
  permissionPreset: text("permission_preset"),
  customPermissions: jsonb("custom_permissions").$type<Record<string, string[]>>(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgIdx: index("clients_org_idx").on(table.organizationId),
  managerIdx: index("clients_manager_idx").on(table.assignedManagerId),
}));

export const onboardingInvitations = pgTable("onboarding_invitations", {
  id: uuid("id").primaryKey(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  requestedPlatforms: jsonb("requested_platforms").$type<string[]>().notNull().default([]),
  personalizedMessage: text("personalized_message"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenHashUnique: uniqueIndex("invitations_token_hash_unique").on(table.tokenHash),
  clientIdx: index("invitations_client_idx").on(table.clientId),
}));

/**
 * platform: 'meta_ads' | 'instagram' | 'google_ads' (Phase 1)
 * oauthAuthorizationStatus: 'not_requested' | 'invitation_sent' | 'authorization_started'
 *    | 'authorization_denied' | 'application_authorized' | 'authorization_expired'
 *    | 'access_revoked' | 'integration_error'
 * tokenValidityStatus: 'not_applicable' | 'valid' | 'expired' | 'invalid' | 'revoked'
 * assetSelectionStatus: 'not_required' | 'asset_selection_required' | 'completed'
 * agencyAccessStatus: 'not_applicable' | 'not_requested' | 'agency_approval_pending'
 *    | 'granted' | 'insufficient_permissions' | 'denied' | 'revoked'
 */
export const platformConnections = pgTable("platform_connections", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  providerUserId: text("provider_user_id"),
  oauthAuthorizationStatus: text("oauth_authorization_status").notNull().default("not_requested"),
  tokenValidityStatus: text("token_validity_status").notNull().default("not_applicable"),
  assetSelectionStatus: text("asset_selection_status").notNull().default("not_required"),
  agencyAccessStatus: text("agency_access_status").notNull().default("not_applicable"),
  grantedScopes: jsonb("granted_scopes").$type<string[]>().notNull().default([]),
  tokenReference: text("token_reference"),
  tokenExpiry: timestamp("token_expiry", { withTimezone: true }),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  connectionHealth: text("connection_health").notNull().default("healthy"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  clientPlatformUnique: uniqueIndex("platform_connections_client_platform_unique").on(table.clientId, table.platform),
  orgIdx: index("platform_connections_org_idx").on(table.organizationId),
  clientIdx: index("platform_connections_client_idx").on(table.clientId),
}));

/**
 * assetType: 'ad_account' | 'page' | 'instagram_account' | 'pixel' | 'catalog'
 *    | 'google_ads_customer' | ...
 * verificationStatus: 'selected' | 'pending_agency_access' | 'verified'
 *    | 'insufficient_permissions' | 'revoked'
 */
export const connectedAssets = pgTable("connected_assets", {
  id: uuid("id").primaryKey(),
  connectionId: uuid("connection_id").notNull().references(() => platformConnections.id, { onDelete: "cascade" }),
  externalAssetId: text("external_asset_id").notNull(),
  assetName: text("asset_name").notNull(),
  assetType: text("asset_type").notNull(),
  grantedPermissions: jsonb("granted_permissions").$type<string[]>().notNull().default([]),
  verificationStatus: text("verification_status").notNull().default("selected"),
  selectedAt: timestamp("selected_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  connectionAssetUnique: uniqueIndex("connected_assets_connection_asset_unique").on(table.connectionId, table.externalAssetId),
  connectionIdx: index("connected_assets_connection_idx").on(table.connectionId),
}));

/** requestStatus: 'pending' | 'approved' | 'denied' | 'expired' | 'manual_approval_required' */
export const accessRequests = pgTable("access_requests", {
  id: uuid("id").primaryKey(),
  connectionId: uuid("connection_id").notNull().references(() => platformConnections.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").references(() => connectedAssets.id, { onDelete: "cascade" }),
  externalRequestId: text("external_request_id"),
  requestedPermissions: jsonb("requested_permissions").$type<string[]>().notNull().default([]),
  requestStatus: text("request_status").notNull().default("pending"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  connectionIdx: index("access_requests_connection_idx").on(table.connectionId),
}));

/** Privileged-only table: never read by anything outside lib/crypto + lib/integrations. */
export const encryptedCredentials = pgTable("encrypted_credentials", {
  id: uuid("id").primaryKey(),
  connectionId: uuid("connection_id").notNull().references(() => platformConnections.id, { onDelete: "cascade" }),
  encryptedAccessToken: text("encrypted_access_token"),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  encryptionKeyVersion: integer("encryption_key_version").notNull().default(1),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  connectionUnique: uniqueIndex("encrypted_credentials_connection_unique").on(table.connectionId),
}));

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  actorType: text("actor_type").notNull(), // 'agency_user' | 'client' | 'system'
  action: text("action").notNull(),
  platform: text("platform"),
  sanitizedMetadata: jsonb("sanitized_metadata").$type<Record<string, unknown>>(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgIdx: index("audit_logs_org_idx").on(table.organizationId),
  clientIdx: index("audit_logs_client_idx").on(table.clientId),
  timestampIdx: index("audit_logs_timestamp_idx").on(table.timestamp),
}));

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  recipientId: uuid("recipient_id").references(() => users.id, { onDelete: "cascade" }),
  recipientType: text("recipient_type").notNull(), // 'agency_user' | 'client'
  notificationType: text("notification_type").notNull(),
  channel: text("channel").notNull(), // 'email' | 'in_app'
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgIdx: index("notifications_org_idx").on(table.organizationId),
  recipientIdx: index("notifications_recipient_idx").on(table.recipientId),
}));

/** Privacy-conscious product analytics events (section 19). No PII/tokens. */
export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  platform: text("platform"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgIdx: index("analytics_events_org_idx").on(table.organizationId),
  typeIdx: index("analytics_events_type_idx").on(table.eventType),
}));

export const allTables = {
  organizations,
  users,
  organizationMemberships,
  sessions,
  clients,
  onboardingInvitations,
  platformConnections,
  connectedAssets,
  accessRequests,
  encryptedCredentials,
  auditLogs,
  notifications,
  analyticsEvents,
};
