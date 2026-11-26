import { currentUser } from "@/lib/session";
import { hubRoleOf } from "@/lib/roles";
import { getDb } from "@/lib/access/db";
import { ensureOrganization } from "@/lib/access/db/queries/organizations";
import { displayName, hubEmail } from "@/lib/access/db/queries/users";
import type { Role } from "@/lib/access/types";

/**
 * The Access Hub has NO login of its own. The one dashboard login (lib/session.ts, MongoDB `users`) is the only way in, and the Hub stores its
 * data in the same MongoDB (lib/access/db). The role always comes from the dashboard user: admin -> super_admin, outreach -> account_manager;
 * mail and social logins have no Hub access.
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

/** The signed-in dashboard user as a Hub context, or null when nobody is signed in, the login has no Hub access, or MongoDB is unreachable. */
export async function getCurrentSession(): Promise<AuthContext | null> {
  const u = await currentUser();
  if (!u) return null;
  const role = hubRoleOf(u.role);
  if (!role) return null;

  const dbResult = await getDb();
  if (!dbResult.ok) return null;
  const org = await ensureOrganization(dbResult.db);
  return {
    sessionId: String(u.id),
    userId: String(u.id),
    name: displayName(u),
    email: hubEmail(u),
    organizationId: org.id,
    organizationName: org.organizationName,
    role,
  };
}
