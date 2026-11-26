import { randomUUID } from "node:crypto";
import type { Filter } from "mongodb";
import { NO_ID, type AnyDb } from "@/lib/access/db";
import type { Client } from "@/lib/access/db/schema-types";
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
  await db.clients.insertOne({
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
    archivedAt: null,
    createdAt: new Date(),
  });
  return id;
}

export async function getClientById(db: AnyDb, organizationId: string, clientId: string) {
  return db.clients.findOne({ id: clientId, organizationId }, NO_ID);
}

/**
 * Deliberately unscoped by organization. ONLY for the public onboarding
 * routes, where the caller's authorization is a valid invitation token (not
 * a session) and the client id comes from that token's own invitation
 * record, never from attacker-supplied input - see lib/public-onboarding.ts.
 * Every other lookup in this codebase must go through getClientById above.
 */
export async function getClientByIdTrusted(db: AnyDb, clientId: string) {
  return db.clients.findOne({ id: clientId }, NO_ID);
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

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listClients(db: AnyDb, organizationId: string, opts: ListClientsOptions = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));

  const filter: Filter<Client> = { organizationId };
  if (!opts.includeArchived) filter.archivedAt = null;
  if (opts.status) filter.onboardingStatus = opts.status;
  if (opts.assignedManagerId) filter.assignedManagerId = opts.assignedManagerId;
  if (opts.search) {
    const term = new RegExp(escapeRegex(opts.search), "i");
    filter.$or = [{ brandName: term }, { contactEmail: term }];
  }

  const sortField = opts.sortBy === "onboardingStatus" ? "onboardingStatus" : opts.sortBy === "brandName" ? "brandName" : "createdAt";
  const dir = opts.sortDir === "asc" ? 1 : -1;

  const [rows, total] = await Promise.all([
    db.clients.find(filter, NO_ID).sort({ [sortField]: dir, id: 1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    db.clients.countDocuments(filter),
  ]);
  return { rows, total, page, pageSize };
}

export async function updateClient(
  db: AnyDb,
  organizationId: string,
  clientId: string,
  patch: Partial<Omit<CreateClientInput, "organizationId">> & { onboardingStatus?: OnboardingStatus },
) {
  const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<Client>;
  if (typeof set.contactEmail === "string") set.contactEmail = set.contactEmail.toLowerCase();
  if (Object.keys(set).length === 0) return getClientById(db, organizationId, clientId);
  return db.clients.findOneAndUpdate({ id: clientId, organizationId }, { $set: set }, { returnDocument: "after", ...NO_ID });
}

export async function archiveClient(db: AnyDb, organizationId: string, clientId: string) {
  await db.clients.updateOne({ id: clientId, organizationId }, { $set: { archivedAt: new Date(), onboardingStatus: "archived" } });
}

export async function unarchiveClient(db: AnyDb, organizationId: string, clientId: string) {
  await db.clients.updateOne({ id: clientId, organizationId }, { $set: { archivedAt: null, onboardingStatus: "in_progress" } });
}

/**
 * Recomputes the client's onboarding status from its platform connections,
 * and persists it. Called after any connection/asset/agency-access mutation
 * so the dashboard table never has to join live to show a status.
 */
export async function recomputeOnboardingStatus(db: AnyDb, clientId: string) {
  const client = await db.clients.findOne({ id: clientId }, NO_ID);
  if (!client || client.archivedAt) return;

  const connections = await db.connections.find({ clientId }, NO_ID).toArray();
  const required = client.requiredPlatforms;

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

  await db.clients.updateOne({ id: clientId }, { $set: { onboardingStatus: status } });
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
  const clients = await db.clients.find({ organizationId, archivedAt: null }, NO_ID).toArray();
  const connections = await db.connections.find({ organizationId }, NO_ID).toArray();

  const totalClients = clients.length;
  const fullyOnboarded = clients.filter((c) => c.onboardingStatus === "completed").length;
  const pendingOnboarding = clients.filter((c) => c.onboardingStatus === "invited" || c.onboardingStatus === "in_progress" || c.onboardingStatus === "not_started").length;
  const connectedAccounts = connections.filter((c) => c.agencyAccessStatus === "granted").length;
  const expiredAuthorizations = connections.filter((c) => c.oauthAuthorizationStatus === "authorization_expired" || c.tokenValidityStatus === "expired").length;
  const accountsRequiringAttention = connections.filter((c) => c.connectionHealth === "needs_attention" || c.connectionHealth === "error").length;

  const clientIds = clients.map((c) => c.id);
  const invitations = clientIds.length
    ? await db.invitations.find({ clientId: { $in: clientIds }, completedAt: { $ne: null } }, NO_ID).toArray()
    : [];

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
