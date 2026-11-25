import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { AnyDb } from "@/lib/access/db";
import * as schema from "@/lib/access/db/schema";
import { generateSecureToken, hashToken } from "@/lib/access/crypto/tokens";

export async function createInvitation(
  db: AnyDb,
  input: { clientId: string; requestedPlatforms: string[]; personalizedMessage?: string | null; expiryDays: number; createdBy: string },
) {
  const raw = generateSecureToken();
  const id = randomUUID();
  await db.insert(schema.onboardingInvitations).values({
    id,
    clientId: input.clientId,
    tokenHash: hashToken(raw),
    requestedPlatforms: input.requestedPlatforms,
    personalizedMessage: input.personalizedMessage ?? null,
    expiresAt: new Date(Date.now() + input.expiryDays * 24 * 60 * 60 * 1000),
    createdBy: input.createdBy,
  });
  return { id, rawToken: raw };
}

export async function getInvitationByRawToken(db: AnyDb, rawToken: string) {
  const rows = await db.select().from(schema.onboardingInvitations).where(eq(schema.onboardingInvitations.tokenHash, hashToken(rawToken))).limit(1);
  return rows[0] ?? null;
}

export async function listInvitationsForClient(db: AnyDb, clientId: string) {
  return db.select().from(schema.onboardingInvitations).where(eq(schema.onboardingInvitations.clientId, clientId)).orderBy(desc(schema.onboardingInvitations.createdAt));
}

export async function getLatestInvitationForClient(db: AnyDb, clientId: string) {
  const rows = await listInvitationsForClient(db, clientId);
  return rows[0] ?? null;
}

export async function markInvitationViewed(db: AnyDb, id: string) {
  await db.update(schema.onboardingInvitations).set({ viewedAt: new Date() }).where(eq(schema.onboardingInvitations.id, id));
}

export async function markInvitationCompleted(db: AnyDb, id: string) {
  await db.update(schema.onboardingInvitations).set({ completedAt: new Date() }).where(eq(schema.onboardingInvitations.id, id));
}

export async function revokeInvitation(db: AnyDb, id: string) {
  await db.update(schema.onboardingInvitations).set({ revokedAt: new Date() }).where(eq(schema.onboardingInvitations.id, id));
}

/** Every pending (not completed, not revoked) invitation across the org, with its client - for the Onboarding admin page. */
export async function listPendingInvitationsForOrg(db: AnyDb, organizationId: string) {
  return db
    .select({ invitation: schema.onboardingInvitations, client: schema.clients })
    .from(schema.onboardingInvitations)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.onboardingInvitations.clientId))
    .where(
      and(
        eq(schema.clients.organizationId, organizationId),
        isNull(schema.onboardingInvitations.completedAt),
        isNull(schema.onboardingInvitations.revokedAt),
        isNull(schema.clients.archivedAt),
      ),
    )
    .orderBy(desc(schema.onboardingInvitations.createdAt));
}

export function invitationIsUsable(invitation: { expiresAt: Date; revokedAt: Date | null }): boolean {
  if (invitation.revokedAt) return false;
  if (invitation.expiresAt.getTime() < Date.now()) return false;
  return true;
}
