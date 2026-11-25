import type * as schema from "./schema";

/** Inferred row types, one place to import them from instead of repeating `typeof schema.x.$inferSelect` everywhere. */
export type Organization = typeof schema.organizations.$inferSelect;
export type User = typeof schema.users.$inferSelect;
export type OrganizationMembership = typeof schema.organizationMemberships.$inferSelect;
export type Client = typeof schema.clients.$inferSelect;
export type OnboardingInvitation = typeof schema.onboardingInvitations.$inferSelect;
export type PlatformConnection = typeof schema.platformConnections.$inferSelect;
export type ConnectedAsset = typeof schema.connectedAssets.$inferSelect;
export type AccessRequest = typeof schema.accessRequests.$inferSelect;
export type AuditLog = typeof schema.auditLogs.$inferSelect;
export type Notification = typeof schema.notifications.$inferSelect;
