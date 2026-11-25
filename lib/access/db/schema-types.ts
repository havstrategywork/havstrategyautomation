// Document shapes for the Access Hub's MongoDB collections (hub_*). Every document has its own string `id` (a UUID, or a dashboard user's _id for people);
// Mongo's own _id is never exposed. Relations are plain id fields, enforced in code (lib/access/db/queries/*), not by the database.
export interface Organization {
  id: string;
  organizationName: string;
  logoUrl: string | null;
  settings: Record<string, unknown>;
  createdAt: Date;
}

export interface Client {
  id: string;
  organizationId: string;
  brandName: string;
  contactName: string;
  contactEmail: string;
  website: string | null;
  industry: string | null;
  logoUrl: string | null;
  assignedManagerId: string | null; // a dashboard user's id
  onboardingStatus: string; // not_started | invited | in_progress | completed | archived
  requiredPlatforms: string[];
  permissionPreset: string | null;
  customPermissions: Record<string, string[]> | null;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface OnboardingInvitation {
  id: string;
  clientId: string;
  tokenHash: string;
  requestedPlatforms: string[];
  personalizedMessage: string | null;
  expiresAt: Date;
  viewedAt: Date | null;
  revokedAt: Date | null;
  completedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface PlatformConnection {
  id: string;
  organizationId: string;
  clientId: string;
  platform: string;
  providerUserId: string | null;
  oauthAuthorizationStatus: string;
  tokenValidityStatus: string;
  assetSelectionStatus: string;
  agencyAccessStatus: string;
  grantedScopes: string[];
  tokenReference: string | null;
  tokenExpiry: Date | null;
  lastVerifiedAt: Date | null;
  connectionHealth: string;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConnectedAsset {
  id: string;
  connectionId: string;
  externalAssetId: string;
  assetName: string;
  assetType: string;
  grantedPermissions: string[];
  verificationStatus: string;
  selectedAt: Date | null;
  verifiedAt: Date | null;
  createdAt: Date;
}

export interface AccessRequest {
  id: string;
  connectionId: string;
  assetId: string | null;
  externalRequestId: string | null;
  requestedPermissions: string[];
  requestStatus: string;
  approvedAt: Date | null;
  createdAt: Date;
}

/** Privileged: never returned by a route handler. */
export interface EncryptedCredential {
  id: string;
  connectionId: string;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  encryptionKeyVersion: number;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  clientId: string | null;
  actorId: string | null;
  actorType: string;
  action: string;
  platform: string | null;
  sanitizedMetadata: Record<string, unknown> | null;
  timestamp: Date;
}

export interface Notification {
  id: string;
  organizationId: string;
  clientId: string | null;
  recipientId: string | null;
  recipientType: string;
  notificationType: string;
  channel: string;
  deliveryStatus: string;
  payload: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface AnalyticsEvent {
  id: string;
  organizationId: string;
  clientId: string | null;
  eventType: string;
  platform: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/** A person with Access Hub access: a dashboard login (MongoDB `users`) with an admin or outreach role. */
export interface Member {
  userId: string;
  name: string;
  email: string;
  role: string; // super_admin | account_manager
}
