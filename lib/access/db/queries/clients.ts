import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyDb } from "@/lib/access/db";
import * as schema from "@/lib/access/db/schema";
import type { OnboardingStatus, PermissionPreset } from "@/lib/access/types";

export interface CreateClientInput {
  organizationId: string;
  brandName: string;
  contactName: string;
  contactEmail: string;
  website?: string | null;
  industry?: string | null;
  logoUrl?: string | null;
  assignedManagerId?: string | null;
  requiredPlatforms: string[];
  permissionPreset?: PermissionPreset | null;
  customPermissions?: Record<string, string[]> | null;
}

export async function createClient(db: AnyDb, input: CreateClientInput) {
  const id = randomUUID();
  await db.insert(schema.clients).values({
    id,
    organizationId: input.organizationId,
    brandName: input.brandName,
    contactName: input.contactName,
    contactEmail: input.contactEmail.toLowerCase(),
    website: input.website ?? null,
    industry: input.industry ?? null,
    logoUrl: input.logoUrl ?? null,
    assignedManagerId: input.assignedManagerId ?? null,
    requiredPlatforms: input.requiredPlatforms,
    permissionPreset: input.permissionPreset ?? null,
    customPermissions: input.customPermissions ?? null,
    onboardingStatus: "not_started",
  });
  return id;
}

export async function getClientById(db: AnyDb, organizationId: string, clientId: string) {
  const rows = await db
    .select()
    .from(schema.clients)
    .where(and(eq(schema.clients.id, clientId), eq(schema.clients.organizationId, organizationId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Deliberately unscoped by organization. ONLY for the public onboarding
 * routes, where the caller's authorization is a valid invitation token (not
 * a session) and the client id comes from that token's own
 * onboarding_invitations.client_id FK, never from attacker-supplied input -
 * see lib/public-onboarding.ts. Every other lookup in this codebase must go
 * through getClientById above.
 */
export async function getClientByIdTrusted(db: AnyDb, clientId: string) {
  const rows = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId)).limit(1);
  return rows[0] ?? null;
}

export interface ListClientsOptions {
  search?: string;
  status?: OnboardingStatus;
  assignedManagerId?: string;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: "brandName" | "createdAt" | "onboardingStatus";
  sortDir?: "asc" | "desc";
}

export async function listClients(db: AnyDb, organizationId: string, opts: ListClientsOptions = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));

  const conditions: SQL[] = [eq(schema.clients.organizationId, organizationId)];
  if (!opts.includeArchived) conditions.push(isNull(schema.clients.archivedAt));
  if (opts.status) conditions.push(eq(schema.clients.onboardingStatus, opts.status));
  if (opts.assignedManagerId) conditions.push(eq(schema.clients.assignedManagerId, opts.assignedManagerId));
  if (opts.search) {
    const term = `%${opts.search}%`;
    const searchCondition = or(ilike(schema.clients.brandName, term), ilike(schema.clients.contactEmail, term));
    if (searchCondition) conditions.push(searchCondition);
  }

  const sortColumn = opts.sortBy === "onboardingStatus" ? schema.clients.onboardingStatus
    : opts.sortBy === "brandName" ? schema.clients.brandName
    : schema.clients.createdAt;
  const orderFn = opts.sortDir === "asc" ? asc : desc;

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db.select().from(schema.clients).where(where).orderBy(orderFn(sortColumn)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)` }).from(schema.clients).where(where),
  ]);

  return { rows, total: Number(totalRows[0]?.count ?? 0), page, pageSize };
}

export async function updateClient(
  db: AnyDb,
  organizationId: string,
  clientId: string,
  patch: Partial<Omit<CreateClientInput, "organizationId">> & { onboardingStatus?: OnboardingStatus },
) {
  const [row] = await db
    .update(schema.clients)
    .set(patch)
    .where(and(eq(schema.clients.id, clientId), eq(schema.clients.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function archiveClient(db: AnyDb, organizationId: string, clientId: string) {
  await db
    .update(schema.clients)
    .set({ archivedAt: new Date(), onboardingStatus: "archived" })
    .where(and(eq(schema.clients.id, clientId), eq(schema.clients.organizationId, organizationId)));
}

export async function unarchiveClient(db: AnyDb, organizationId: string, clientId: string) {
  await db
    .update(schema.clients)
    .set({ archivedAt: null, onboardingStatus: "in_progress" })
    .where(and(eq(schema.clients.id, clientId), eq(schema.clients.organizationId, organizationId)));
}

/**
 * Recomputes clients.onboarding_status from its platform_connections, and
 * persists it. Called after any connection/asset/agency-access mutation so
 * the dashboard table never has to join live to show a status (section 8).
 */
export async function recomputeOnboardingStatus(db: AnyDb, clientId: string) {
  const client = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId)).limit(1);
  if (!client[0] || client[0].archivedAt) return;

  const connections = await db.select().from(schema.platformConnections).where(eq(schema.platformConnections.clientId, clientId));
  const required = client[0].requiredPlatforms as string[];

  let status: OnboardingStatus = "not_started";
  if (connections.length === 0) {
    status = "not_started";
  } else if (connections.every((c) => c.oauthAuthorizationStatus === "invitation_sent")) {
    status = "invited";
  } else {
    const allVerified = required.every((platform) => {
      const conn = connections.find((c) => c.platform === platform);
      return conn?.agencyAccessStatus === "granted" && conn.assetSelectionStatus === "completed";
    });
    status = allVerified ? "completed" : "in_progress";
  }

  await db.update(schema.clients).set({ onboardingStatus: status }).where(eq(schema.clients.id, clientId));
  return status;
}

export interface DashboardKpis {
  totalClients: number;
  fullyOnboarded: number;
  pendingOnboarding: number;
  connectedAccounts: number;
  expiredAuthorizations: number;
  accountsRequiringAttention: number;
  avgOnboardingCompletionHours: number | null;
  onboardingCompletionRate: number | null;
}

export async function getDashboardKpis(db: AnyDb, organizationId: string): Promise<DashboardKpis> {
  const clients = await db.select().from(schema.clients).where(and(eq(schema.clients.organizationId, organizationId), isNull(schema.clients.archivedAt)));
  const connections = await db.select().from(schema.platformConnections).where(eq(schema.platformConnections.organizationId, organizationId));

  const totalClients = clients.length;
  const fullyOnboarded = clients.filter((c) => c.onboardingStatus === "completed").length;
  const pendingOnboarding = clients.filter((c) => c.onboardingStatus === "invited" || c.onboardingStatus === "in_progress" || c.onboardingStatus === "not_started").length;
  const connectedAccounts = connections.filter((c) => c.agencyAccessStatus === "granted").length;
  const expiredAuthorizations = connections.filter((c) => c.oauthAuthorizationStatus === "authorization_expired" || c.tokenValidityStatus === "expired").length;
  const accountsRequiringAttention = connections.filter((c) => c.connectionHealth === "needs_attention" || c.connectionHealth === "error").length;

  const invitations = await db
    .select({ createdAt: schema.onboardingInvitations.createdAt, completedAt: schema.onboardingInvitations.completedAt })
    .from(schema.onboardingInvitations)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.onboardingInvitations.clientId))
    .where(and(eq(schema.clients.organizationId, organizationId), sql`${schema.onboardingInvitations.completedAt} is not null`));

  const durationsHours = invitations.map((i) => (i.completedAt!.getTime() - i.createdAt.getTime()) / 3_600_000);
  const avgOnboardingCompletionHours = durationsHours.length ? durationsHours.reduce((a, b) => a + b, 0) / durationsHours.length : null;
  const onboardingCompletionRate = totalClients > 0 ? fullyOnboarded / totalClients : null;

  return {
    totalClients,
    fullyOnboarded,
    pendingOnboarding,
    connectedAccounts,
    expiredAuthorizations,
    accountsRequiringAttention,
    avgOnboardingCompletionHours,
    onboardingCompletionRate,
  };
}
