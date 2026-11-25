import { randomUUID } from "node:crypto";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";
import { generateSecureToken, hashToken, encryptSecret } from "@/lib/access/crypto/tokens";
import { getAppUrl } from "@/lib/access/env";
import { PRODUCT_NAME } from "@/lib/access/branding";

type DemoDb = PgliteDatabase<typeof schema>;

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);

/** Sample data only (ACCESS_DEMO_DATA=on): placeholder agency users that own the sample clients. They have no password and cannot sign in - the one real login lives in the dashboard (see lib/access/auth/session.ts). */
export const DEMO_CREDENTIALS = [
  { role: "super_admin", name: "Havstrategy Admin", email: "admin@havstrategy.local" },
  { role: "account_manager", name: "Havstrategy Manager", email: "manager@havstrategy.local" },
] as const;

function enc(plaintext: string): string {
  const result = encryptSecret(plaintext);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export async function seedDemoData(db: DemoDb): Promise<void> {
  const existing = await db.select({ id: schema.organizations.id }).from(schema.organizations).limit(1);
  if (existing.length > 0) return;

  const orgId = randomUUID();
  await db.insert(schema.organizations).values({
    id: orgId,
    organizationName: "Havstrategy",
    logoUrl: null,
    settings: {},
  });

  // The organisation is all a real install needs. The five synthetic sample clients below are opt-in so they never clutter real work.
  if (process.env.ACCESS_DEMO_DATA !== "on") return;

  const userIds: Record<string, string> = {};
  for (const cred of DEMO_CREDENTIALS) {
    const id = randomUUID();
    userIds[cred.role] = id;
    await db.insert(schema.users).values({
      id,
      name: cred.name,
      email: cred.email,
      passwordHash: null,
    });
    await db.insert(schema.organizationMemberships).values({
      id: randomUUID(),
      organizationId: orgId,
      userId: id,
      role: cred.role,
    });
  }
  const adminId = userIds.super_admin;
  const managerId = userIds.account_manager;

  const auditRows: (typeof schema.auditLogs.$inferInsert)[] = [];
  const notificationRows: (typeof schema.notifications.$inferInsert)[] = [];
  const analyticsRows: (typeof schema.analyticsEvents.$inferInsert)[] = [];
  const printableLinks: string[] = [];

  function audit(clientId: string, action: string, platform: string | null, actorId: string | null, actorType: "agency_user" | "client" | "system", when: Date, metadata?: Record<string, unknown>) {
    auditRows.push({ id: randomUUID(), organizationId: orgId, clientId, actorId, actorType, action, platform, sanitizedMetadata: metadata ?? null, timestamp: when });
  }
  function notify(clientId: string, type: string, recipientId: string | null, recipientType: "agency_user" | "client", when: Date, payload?: Record<string, unknown>) {
    notificationRows.push({ id: randomUUID(), organizationId: orgId, clientId, recipientId, recipientType, notificationType: type, channel: "in_app", deliveryStatus: "sent", payload: payload ?? null, createdAt: when });
  }
  function track(clientId: string, eventType: string, platform: string | null, when: Date) {
    analyticsRows.push({ id: randomUUID(), organizationId: orgId, clientId, eventType, platform, metadata: {}, createdAt: when });
  }

  async function createInvitation(clientId: string, platforms: string[], createdAt: Date, opts: { viewed?: Date; completed?: Date; revoked?: boolean; expiresInDays?: number } = {}) {
    const raw = generateSecureToken();
    await db.insert(schema.onboardingInvitations).values({
      id: randomUUID(),
      clientId,
      tokenHash: hashToken(raw),
      requestedPlatforms: platforms,
      expiresAt: daysFromNow(opts.expiresInDays ?? 14),
      viewedAt: opts.viewed ?? null,
      completedAt: opts.completed ?? null,
      revokedAt: opts.revoked ? new Date() : null,
      createdBy: managerId,
      createdAt,
    });
    return `${getAppUrl()}/access/onboard/${raw}`;
  }

  async function createConnection(input: {
    clientId: string;
    platform: string;
    oauthAuthorizationStatus: string;
    tokenValidityStatus: string;
    assetSelectionStatus: string;
    agencyAccessStatus: string;
    grantedScopes?: string[];
    connectionHealth?: string;
    errorMessage?: string | null;
    lastVerifiedAt?: Date | null;
    tokenExpiry?: Date | null;
    withCredentials?: boolean;
    assets?: { name: string; type: string; status: string }[];
  }) {
    const connId = randomUUID();
    await db.insert(schema.platformConnections).values({
      id: connId,
      organizationId: orgId,
      clientId: input.clientId,
      platform: input.platform,
      providerUserId: input.oauthAuthorizationStatus === "not_requested" ? null : `demo-${input.platform}-user-${connId.slice(0, 8)}`,
      oauthAuthorizationStatus: input.oauthAuthorizationStatus,
      tokenValidityStatus: input.tokenValidityStatus,
      assetSelectionStatus: input.assetSelectionStatus,
      agencyAccessStatus: input.agencyAccessStatus,
      grantedScopes: input.grantedScopes ?? [],
      tokenReference: input.withCredentials ? connId : null,
      tokenExpiry: input.tokenExpiry ?? null,
      lastVerifiedAt: input.lastVerifiedAt ?? null,
      connectionHealth: input.connectionHealth ?? "healthy",
      errorMessage: input.errorMessage ?? null,
    });

    if (input.withCredentials) {
      await db.insert(schema.encryptedCredentials).values({
        id: connId,
        connectionId: connId,
        encryptedAccessToken: enc(`demo-access-token-${connId}`),
        encryptedRefreshToken: enc(`demo-refresh-token-${connId}`),
        expiresAt: input.tokenExpiry ?? null,
      });
    }

    for (const asset of input.assets ?? []) {
      await db.insert(schema.connectedAssets).values({
        id: randomUUID(),
        connectionId: connId,
        externalAssetId: `demo-${Math.random().toString(36).slice(2, 10)}`,
        assetName: asset.name,
        assetType: asset.type,
        grantedPermissions: input.grantedScopes ?? [],
        verificationStatus: asset.status,
        selectedAt: daysAgo(3),
        verifiedAt: asset.status === "verified" ? daysAgo(2) : null,
      });
    }

    return connId;
  }

  // ---------------------------------------------------------------------
  // 1. Luma Skincare - fully onboarded across all three Phase 1 platforms.
  // ---------------------------------------------------------------------
  {
    const clientId = randomUUID();
    await db.insert(schema.clients).values({
      id: clientId,
      organizationId: orgId,
      brandName: "Luma Skincare",
      contactName: "Meera Iyer",
      contactEmail: "meera@lumaskincare.example",
      website: "https://lumaskincare.example",
      industry: "Beauty & Personal Care",
      assignedManagerId: managerId,
      onboardingStatus: "completed",
      requiredPlatforms: ["meta_ads", "instagram", "google_ads"],
      permissionPreset: "full_marketing_management",
      createdAt: daysAgo(18),
    });
    await createInvitation(clientId, ["meta_ads", "instagram", "google_ads"], daysAgo(18), { viewed: daysAgo(17), completed: daysAgo(15) });
    await createConnection({
      clientId, platform: "meta_ads", oauthAuthorizationStatus: "application_authorized", tokenValidityStatus: "valid",
      assetSelectionStatus: "completed", agencyAccessStatus: "granted", grantedScopes: ["ads_read", "ads_management", "business_management"],
      lastVerifiedAt: daysAgo(1), tokenExpiry: daysFromNow(45), withCredentials: true,
      assets: [{ name: "Luma Skincare Ads", type: "ad_account", status: "verified" }, { name: "Luma Skincare", type: "page", status: "verified" }],
    });
    await createConnection({
      clientId, platform: "instagram", oauthAuthorizationStatus: "application_authorized", tokenValidityStatus: "valid",
      assetSelectionStatus: "completed", agencyAccessStatus: "granted", grantedScopes: ["instagram_basic", "instagram_manage_insights", "instagram_content_publish"],
      lastVerifiedAt: daysAgo(1), tokenExpiry: daysFromNow(45), withCredentials: true,
      assets: [{ name: "@lumaskincare", type: "instagram_account", status: "verified" }],
    });
    await createConnection({
      clientId, platform: "google_ads", oauthAuthorizationStatus: "application_authorized", tokenValidityStatus: "valid",
      assetSelectionStatus: "completed", agencyAccessStatus: "granted", grantedScopes: ["https://www.googleapis.com/auth/adwords"],
      lastVerifiedAt: daysAgo(1), tokenExpiry: daysFromNow(60), withCredentials: true,
      assets: [{ name: "Luma Skincare - Google Ads", type: "google_ads_customer", status: "verified" }],
    });
    audit(clientId, "client.created", null, managerId, "agency_user", daysAgo(18));
    audit(clientId, "invitation.generated", null, managerId, "agency_user", daysAgo(18));
    audit(clientId, "invitation.viewed", null, null, "client", daysAgo(17));
    for (const p of ["meta_ads", "instagram", "google_ads"]) {
      audit(clientId, "oauth.authorized", p, null, "client", daysAgo(16));
      audit(clientId, "assets.selected", p, null, "client", daysAgo(16));
      audit(clientId, "agency_access.verified", p, adminId, "system", daysAgo(15));
    }
    audit(clientId, "onboarding.completed", null, null, "system", daysAgo(15));
    notify(clientId, "onboarding_completed", managerId, "agency_user", daysAgo(15), { brandName: "Luma Skincare" });
    track(clientId, "client_created", null, daysAgo(18));
    track(clientId, "onboarding_completed", null, daysAgo(15));
  }

  // ---------------------------------------------------------------------
  // 2. Verve Activewear - mid-onboarding: one platform needs asset
  //    selection, one authorization was started and abandoned, one unstarted.
  // ---------------------------------------------------------------------
  {
    const clientId = randomUUID();
    await db.insert(schema.clients).values({
      id: clientId,
      organizationId: orgId,
      brandName: "Verve Activewear",
      contactName: "Dev Kapoor",
      contactEmail: "dev@verveactive.example",
      website: "https://verveactive.example",
      industry: "Apparel",
      assignedManagerId: managerId,
      onboardingStatus: "in_progress",
      requiredPlatforms: ["meta_ads", "instagram", "google_ads"],
      permissionPreset: "performance_marketing",
      createdAt: daysAgo(6),
    });
    const link = await createInvitation(clientId, ["meta_ads", "instagram", "google_ads"], daysAgo(6), { viewed: daysAgo(5) });
    printableLinks.push(`Verve Activewear (in progress):      ${link}`);
    await createConnection({
      clientId, platform: "meta_ads", oauthAuthorizationStatus: "application_authorized", tokenValidityStatus: "valid",
      assetSelectionStatus: "asset_selection_required", agencyAccessStatus: "not_requested",
      grantedScopes: ["ads_read", "ads_management", "business_management"], connectionHealth: "needs_attention", withCredentials: true,
    });
    await createConnection({
      clientId, platform: "instagram", oauthAuthorizationStatus: "authorization_started", tokenValidityStatus: "not_applicable",
      assetSelectionStatus: "not_required", agencyAccessStatus: "not_applicable", connectionHealth: "needs_attention",
    });
    await createConnection({
      clientId, platform: "google_ads", oauthAuthorizationStatus: "invitation_sent", tokenValidityStatus: "not_applicable",
      assetSelectionStatus: "not_required", agencyAccessStatus: "not_applicable",
    });
    audit(clientId, "client.created", null, managerId, "agency_user", daysAgo(6));
    audit(clientId, "invitation.generated", null, managerId, "agency_user", daysAgo(6));
    audit(clientId, "invitation.viewed", null, null, "client", daysAgo(5));
    audit(clientId, "oauth.authorized", "meta_ads", null, "client", daysAgo(5));
    notify(clientId, "pending_platform_connection", managerId, "agency_user", daysAgo(4), { brandName: "Verve Activewear", platform: "meta_ads" });
    track(clientId, "client_created", null, daysAgo(6));
    track(clientId, "onboarding_link_opened", null, daysAgo(5));
    track(clientId, "authorization_completed", "meta_ads", daysAgo(5));
  }

  // ---------------------------------------------------------------------
  // 3. Kettlebell Kitchen - invitation sent, client has not opened it yet.
  // ---------------------------------------------------------------------
  {
    const clientId = randomUUID();
    await db.insert(schema.clients).values({
      id: clientId,
      organizationId: orgId,
      brandName: "Kettlebell Kitchen",
      contactName: "Owen Fitzgerald",
      contactEmail: "owen@kettlebellkitchen.example",
      website: "https://kettlebellkitchen.example",
      industry: "Food & Beverage",
      assignedManagerId: null,
      onboardingStatus: "invited",
      requiredPlatforms: ["meta_ads"],
      permissionPreset: "analytics_only",
      createdAt: daysAgo(1),
    });
    const link = await createInvitation(clientId, ["meta_ads"], daysAgo(1));
    printableLinks.push(`Kettlebell Kitchen (not yet opened):  ${link}`);
    await createConnection({
      clientId, platform: "meta_ads", oauthAuthorizationStatus: "invitation_sent", tokenValidityStatus: "not_applicable",
      assetSelectionStatus: "not_required", agencyAccessStatus: "not_applicable",
    });
    audit(clientId, "client.created", null, null, "agency_user", daysAgo(1));
    audit(clientId, "invitation.generated", null, null, "agency_user", daysAgo(1));
    track(clientId, "client_created", null, daysAgo(1));
    track(clientId, "onboarding_link_generated", null, daysAgo(1));
  }

  // ---------------------------------------------------------------------
  // 4. Orbit Eyewear - denied authorization on one platform, insufficient
  //    permissions granted on another. Demonstrates "never mark connected
  //    until verified".
  // ---------------------------------------------------------------------
  {
    const clientId = randomUUID();
    await db.insert(schema.clients).values({
      id: clientId,
      organizationId: orgId,
      brandName: "Orbit Eyewear",
      contactName: "Priya Shah",
      contactEmail: "priya@orbiteyewear.example",
      website: "https://orbiteyewear.example",
      industry: "Eyewear & Fashion",
      assignedManagerId: managerId,
      onboardingStatus: "in_progress",
      requiredPlatforms: ["meta_ads", "google_ads"],
      permissionPreset: "custom",
      customPermissions: { meta_ads: ["ads_read"], google_ads: ["https://www.googleapis.com/auth/adwords"] },
      createdAt: daysAgo(9),
    });
    const link = await createInvitation(clientId, ["meta_ads", "google_ads"], daysAgo(9), { viewed: daysAgo(8) });
    printableLinks.push(`Orbit Eyewear (needs attention):      ${link}`);
    await createConnection({
      clientId, platform: "meta_ads", oauthAuthorizationStatus: "authorization_denied", tokenValidityStatus: "not_applicable",
      assetSelectionStatus: "not_required", agencyAccessStatus: "not_applicable", connectionHealth: "error",
      errorMessage: "Client denied the requested permissions during authorization.",
    });
    await createConnection({
      clientId, platform: "google_ads", oauthAuthorizationStatus: "application_authorized", tokenValidityStatus: "valid",
      assetSelectionStatus: "completed", agencyAccessStatus: "insufficient_permissions", grantedScopes: ["https://www.googleapis.com/auth/adwords"],
      connectionHealth: "needs_attention", withCredentials: true, lastVerifiedAt: daysAgo(7),
      errorMessage: "Granted access does not include campaign management; client approved read-only access only.",
      assets: [{ name: "Orbit Eyewear - Google Ads", type: "google_ads_customer", status: "insufficient_permissions" }],
    });
    audit(clientId, "client.created", null, managerId, "agency_user", daysAgo(9));
    audit(clientId, "invitation.generated", null, managerId, "agency_user", daysAgo(9));
    audit(clientId, "invitation.viewed", null, null, "client", daysAgo(8));
    audit(clientId, "oauth.denied", "meta_ads", null, "client", daysAgo(8));
    audit(clientId, "oauth.authorized", "google_ads", null, "client", daysAgo(7));
    audit(clientId, "agency_access.insufficient", "google_ads", adminId, "system", daysAgo(7));
    notify(clientId, "incomplete_permissions", managerId, "agency_user", daysAgo(7), { brandName: "Orbit Eyewear", platform: "google_ads" });
    track(clientId, "client_created", null, daysAgo(9));
    track(clientId, "authorization_denied", "meta_ads", daysAgo(8));
  }

  // ---------------------------------------------------------------------
  // 5. Bloom & Co - was fully connected, Google Ads authorization has
  //    since expired and needs client reauthorization.
  // ---------------------------------------------------------------------
  {
    const clientId = randomUUID();
    await db.insert(schema.clients).values({
      id: clientId,
      organizationId: orgId,
      brandName: "Bloom & Co",
      contactName: "Sana Qureshi",
      contactEmail: "sana@bloomandco.example",
      website: "https://bloomandco.example",
      industry: "Home & Lifestyle",
      assignedManagerId: managerId,
      onboardingStatus: "in_progress",
      requiredPlatforms: ["google_ads"],
      permissionPreset: "performance_marketing",
      createdAt: daysAgo(40),
    });
    await createInvitation(clientId, ["google_ads"], daysAgo(40), { viewed: daysAgo(39), completed: daysAgo(37) });
    await createConnection({
      clientId, platform: "google_ads", oauthAuthorizationStatus: "authorization_expired", tokenValidityStatus: "expired",
      assetSelectionStatus: "completed", agencyAccessStatus: "granted", grantedScopes: ["https://www.googleapis.com/auth/adwords"],
      connectionHealth: "needs_attention", lastVerifiedAt: daysAgo(20), tokenExpiry: daysAgo(20), withCredentials: true,
      errorMessage: "Refresh token rejected by Google - client must reauthorize.",
      assets: [{ name: "Bloom & Co - Google Ads", type: "google_ads_customer", status: "verified" }],
    });
    audit(clientId, "client.created", null, managerId, "agency_user", daysAgo(40));
    audit(clientId, "onboarding.completed", null, null, "system", daysAgo(37));
    audit(clientId, "token.expired", "google_ads", null, "system", daysAgo(20));
    notify(clientId, "expired_authorization", managerId, "agency_user", daysAgo(20), { brandName: "Bloom & Co", platform: "google_ads" });
    track(clientId, "client_created", null, daysAgo(40));
    track(clientId, "onboarding_completed", null, daysAgo(37));
  }

  if (auditRows.length) await db.insert(schema.auditLogs).values(auditRows);
  if (notificationRows.length) await db.insert(schema.notifications).values(notificationRows);
  if (analyticsRows.length) await db.insert(schema.analyticsEvents).values(analyticsRows);

  console.log(
    [
      "",
      "================================================================",
      ` ${PRODUCT_NAME} demo data seeded.`,
      "----------------------------------------------------------------",
      " Sign in with your normal dashboard login, then open the Access Hub tabs.",
      "",
      " Sample client onboarding links (token shown once - this run only):",
      ...printableLinks.map((l) => `   ${l}`),
      "================================================================",
      "",
    ].join("\n"),
  );
}
