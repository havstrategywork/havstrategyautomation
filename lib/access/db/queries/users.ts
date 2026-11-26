import { ObjectId } from "mongodb";
import { db as mongo, type User } from "@/lib/db";
import { hubRoleOf, roleOf } from "@/lib/roles";
import type { Member } from "@/lib/access/db/schema-types";
import type { AnyDb } from "@/lib/access/db";

/**
 * People in the Access Hub ARE the dashboard's logins (MongoDB `users`): there is no second user table. Only admin and outreach logins have
 * Hub access (hubRoleOf), so only they are members. The id is the login's _id as a string.
 */
export const displayName = (u: { username: string; email?: string | null }) => (u.email ?? u.username).split("@")[0] || u.username;
export const hubEmail = (u: { username: string; email?: string | null }) => (u.email ?? (u.username.includes("@") ? u.username : `${u.username}@havstrategy.local`)).toLowerCase();

export function toMember(u: User): Member | null {
  const hub = hubRoleOf(roleOf(u.role));
  return hub ? { userId: String(u._id), name: displayName(u), email: hubEmail(u), role: hub } : null;
}

// `db` is unused (the logins live in the dashboard's collection) but kept so callers read the same as every other query helper.
export async function listOrganizationMembers(_db?: AnyDb, _organizationId?: string): Promise<Member[]> {
  const { users } = await mongo();
  return (await users.find({}).sort({ createdAt: 1 }).toArray()).flatMap((u) => toMember(u) ?? []);
}

export async function getMemberById(userId: string): Promise<{ user: User; member: Member } | null> {
  if (!ObjectId.isValid(userId)) return null;
  const { users } = await mongo();
  const user = await users.findOne({ _id: new ObjectId(userId) });
  const member = user && toMember(user);
  return user && member ? { user, member } : null;
}
