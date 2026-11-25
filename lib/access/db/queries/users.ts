import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { AnyDb } from "@/lib/access/db";
import * as schema from "@/lib/access/db/schema";
import type { Role } from "@/lib/access/types";

export async function findUserByEmail(db: AnyDb, email: string) {
  const rows = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())).limit(1);
  return rows[0] ?? null;
}

export async function getUserById(db: AnyDb, userId: string) {
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function getMembership(db: AnyDb, organizationId: string, userId: string) {
  const rows = await db
    .select()
    .from(schema.organizationMemberships)
    .where(and(eq(schema.organizationMemberships.organizationId, organizationId), eq(schema.organizationMemberships.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** A user may belong to more than one organization; agency sessions are scoped to exactly one at a time. */
export async function getMembershipsForUser(db: AnyDb, userId: string) {
  return db
    .select({
      organizationId: schema.organizationMemberships.organizationId,
      role: schema.organizationMemberships.role,
      organizationName: schema.organizations.organizationName,
      logoUrl: schema.organizations.logoUrl,
    })
    .from(schema.organizationMemberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.organizationMemberships.organizationId))
    .where(eq(schema.organizationMemberships.userId, userId));
}

export async function listOrganizationMembers(db: AnyDb, organizationId: string) {
  return db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.organizationMemberships.role,
      createdAt: schema.organizationMemberships.createdAt,
    })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.organizationMemberships.userId))
    .where(eq(schema.organizationMemberships.organizationId, organizationId));
}

export async function createUserWithMembership(
  db: AnyDb,
  input: { name: string; email: string; passwordHash: string; organizationId: string; role: Role },
) {
  const userId = randomUUID();
  await db.insert(schema.users).values({ id: userId, name: input.name, email: input.email.toLowerCase(), passwordHash: input.passwordHash });
  await db.insert(schema.organizationMemberships).values({ id: randomUUID(), organizationId: input.organizationId, userId, role: input.role });
  return userId;
}

export async function updateMemberRole(db: AnyDb, organizationId: string, userId: string, role: Role) {
  await db
    .update(schema.organizationMemberships)
    .set({ role })
    .where(and(eq(schema.organizationMemberships.organizationId, organizationId), eq(schema.organizationMemberships.userId, userId)));
}

export async function removeMember(db: AnyDb, organizationId: string, userId: string) {
  await db
    .delete(schema.organizationMemberships)
    .where(and(eq(schema.organizationMemberships.organizationId, organizationId), eq(schema.organizationMemberships.userId, userId)));
}

export async function recordFailedLogin(db: AnyDb, userId: string, lockedUntil: Date | null, failedCount: number) {
  await db.update(schema.users).set({ failedLoginCount: failedCount, lockedUntil }).where(eq(schema.users.id, userId));
}

export async function clearFailedLogins(db: AnyDb, userId: string) {
  await db.update(schema.users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(schema.users.id, userId));
}

// --- Sessions -------------------------------------------------------------

export async function createSession(
  db: AnyDb,
  input: { userId: string; tokenHash: string; expiresAt: Date; userAgent?: string | null; ipAddress?: string | null },
) {
  const id = randomUUID();
  await db.insert(schema.sessions).values({
    id,
    userId: input.userId,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
    userAgent: input.userAgent ?? null,
    ipAddress: input.ipAddress ?? null,
  });
  return id;
}

export async function findActiveSessionByTokenHash(db: AnyDb, tokenHash: string) {
  const rows = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.tokenHash, tokenHash), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function touchSession(db: AnyDb, sessionId: string) {
  await db.update(schema.sessions).set({ lastSeenAt: new Date() }).where(eq(schema.sessions.id, sessionId));
}

export async function revokeSession(db: AnyDb, sessionId: string) {
  await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.id, sessionId));
}

export async function revokeAllSessionsForUser(db: AnyDb, userId: string) {
  await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.userId, userId));
}
