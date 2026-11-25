import { redirect } from "next/navigation";
import { getCurrentSession } from "./session";
import type { Role } from "@/lib/access/types";

/** Server-side page guard for role-restricted dashboard sections (super_admin-only pages). Pairs with the API's own capability checks, which remain the real enforcement. */
export async function requireRole(allowed: Role[]) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!allowed.includes(session.role)) redirect("/access?denied=1");
  return session;
}
