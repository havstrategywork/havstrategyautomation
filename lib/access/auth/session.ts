import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db as mongo } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { getDb, type AnyDb } from "@/lib/access/db";
import * as schema from "@/lib/access/db/schema";
import { hubRoleOf, type Role as MainRole } from "@/lib/roles";
import type { Role } from "@/lib/access/types";

/**
 * The Access Hub has NO login of its own. The one dashboard login (lib/session.ts, MongoDB users) is the only way in; this file
 * mirrors that signed-in person into the Hub's Postgres (organisation membership) so audit logs, "assigned manager" and the team list
 * keep working. The role always comes from the dashboard user: admin -> super_admin, manager -> account_manager, member -> team_member.
 */
export interface AuthContext {
  sessionId: string;
  userId: string;
  name: string;
  email: string;
  organizationId: string;
  organizationName: string;
  role: Role;
}

export const ORG_NAME = "Havstrategy";
/** Dashboard users created before emails existed have none; the Hub needs a unique one, so derive a stable placeholder. */
export const hubEmail = (u: { username: string; email?: string | null }) => (u.email ?? (u.username.includes("@") ? u.username : `${u.username}@havstrategy.local`)).toLowerCase();

/** The single organisation every dashboard user belongs to (created on first use). */
export async function ensureOrganization(db: AnyDb) {
  const [org] = await db.select().from(schema.organizations).limit(1);
  if (org) return org;
  const row = { id: randomUUID(), organizationName: ORG_NAME, logoUrl: null, settings: {} };
  await db.insert(schema.organizations).values(row);
  const [created] = await db.select().from(schema.organizations).limit(1);
  return created ?? { ...row, createdAt: new Date() };
}

/** Finds or creates the Hub user + membership for a dashboard user and makes the role match. Returns the Hub user id. */
export async function ensureHubUser(db: AnyDb, org: { id: string }, u: { username: string; email?: string | null; role?: MainRole }) {
  const email = hubEmail(u), role = hubRoleOf(u.role ?? "admin");
  if (!role) return null; // mail / social logins have no Access Hub access
  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user) {
    const id = randomUUID();
    await db.insert(schema.users).values({ id, name: u.username.includes("@") ? u.username.split("@")[0] : u.username, email, passwordHash: null });
    [user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  }
  const [m] = await db.select().from(schema.organizationMemberships)
    .where(and(eq(schema.organizationMemberships.organizationId, org.id), eq(schema.organizationMemberships.userId, user.id))).limit(1);
  if (!m) await db.insert(schema.organizationMemberships).values({ id: randomUUID(), organizationId: org.id, userId: user.id, role });
  else if (m.role !== role) await db.update(schema.organizationMemberships).set({ role }).where(eq(schema.organizationMemberships.id, m.id));
  return { user, role };
}

/** Makes sure every dashboard user has a Hub membership (so the Team page lists everyone, not only people who opened the Hub). */
export async function syncAllUsers(db: AnyDb) {
  const org = await ensureOrganization(db);
  const { users } = await mongo();
  for (const u of await users.find({}).toArray()) await ensureHubUser(db, org, u); // skips logins without Hub access
}

const seen = new Map<string, AuthContext>(); // per process: skips the Postgres round trips while nothing about the user changed

/** The signed-in dashboard user as a Hub context, or null when nobody is signed in (or the Hub database is unreachable). */
export async function getCurrentSession(): Promise<AuthContext | null> {
  const u = await currentUser();
  if (!u) return null;
  const key = `${u.id}|${u.username}|${u.email ?? ""}|${u.role}`;
  const hit = seen.get(key);
  if (hit) return hit;

  const dbResult = await getDb();
  if (!dbResult.ok) return null;
  const org = await ensureOrganization(dbResult.db);
  const hub = await ensureHubUser(dbResult.db, org, { username: u.username, email: u.email, role: u.role });
  if (!hub) return null;
  const { user, role } = hub;
  const ctx: AuthContext = { sessionId: String(u.id), userId: user.id, name: user.name, email: user.email, organizationId: org.id, organizationName: org.organizationName, role };
  if (seen.size > 200) seen.clear();
  seen.set(key, ctx);
  return ctx;
}
