import { randomUUID } from "node:crypto";
import { NO_ID, type AnyDb } from "@/lib/access/db";
import type { Client, OnboardingInvitation } from "@/lib/access/db/schema-types";
import { generateSecureToken, hashToken } from "@/lib/access/crypto/tokens";

export async function createInvitation(
  db: AnyDb,
  input: { clientId: string; requestedPlatforms: string[]; personalizedMessage?: string | null; expiryDays: number; createdBy: string },
) {
  const raw = generateSecureToken();
  const id = randomUUID();
  await db.invitations.insertOne({
    id,
    clientId: input.clientId,
    tokenHash: hashToken(raw),
    requestedPlatforms: input.requestedPlatforms,
    personalizedMessage: input.personalizedMessage ?? null,
    expiresAt: new Date(Date.now() + input.expiryDays * 24 * 60 * 60 * 1000),
    viewedAt: null,
    revokedAt: null,
    completedAt: null,
    createdBy: input.createdBy,
    createdAt: new Date(),
  });
  return { id, rawToken: raw };
}

export async function getInvitationByRawToken(db: AnyDb, rawToken: string) {
  return db.invitations.findOne({ tokenHash: hashToken(rawToken) }, NO_ID);
}

export async function listInvitationsForClient(db: AnyDb, clientId: string) {
  return db.invitations.find({ clientId }, NO_ID).sort({ createdAt: -1 }).toArray();
}

export async function getLatestInvitationForClient(db: AnyDb, clientId: string) {
  const rows = await listInvitationsForClient(db, clientId);
  return rows[0] ?? null;
}

export async function markInvitationViewed(db: AnyDb, id: string) {
  await db.invitations.updateOne({ id }, { $set: { viewedAt: new Date() } });
}

export async function markInvitationCompleted(db: AnyDb, id: string) {
  await db.invitations.updateOne({ id }, { $set: { completedAt: new Date() } });
}

export async function revokeInvitation(db: AnyDb, id: string) {
  await db.invitations.updateOne({ id }, { $set: { revokedAt: new Date() } });
}

/**
 * Every pending (not completed, not revoked) invitation with its client, newest first. `organizationId` limits it to one org;
 * `extra` adds invitation conditions (the reminder job uses it). Archived clients are skipped.
 */
export async function listPendingInvitationsWithClients(
  db: AnyDb,
  opts: { organizationId?: string; extra?: Record<string, unknown> } = {},
): Promise<{ invitation: OnboardingInvitation; client: Client }[]> {
  const clients = await db.clients.find({ archivedAt: null, ...(opts.organizationId ? { organizationId: opts.organizationId } : {}) }, NO_ID).toArray();
  if (!clients.length) return [];
  const byId = new Map(clients.map((c) => [c.id, c]));
  const invitations = await db.invitations
    .find({ clientId: { $in: [...byId.keys()] }, completedAt: null, revokedAt: null, ...opts.extra }, NO_ID)
    .sort({ createdAt: -1 })
    .toArray();
  return invitations.flatMap((invitation) => {
    const client = byId.get(invitation.clientId);
    return client ? [{ invitation, client }] : [];
  });
}

/** Every pending invitation across the org, with its client - for the Onboarding admin page. */
export async function listPendingInvitationsForOrg(db: AnyDb, organizationId: string) {
  return listPendingInvitationsWithClients(db, { organizationId });
}

export function invitationIsUsable(invitation: { expiresAt: Date; revokedAt: Date | null }): boolean {
  if (invitation.revokedAt) return false;
  if (invitation.expiresAt.getTime() < Date.now()) return false;
  return true;
}
