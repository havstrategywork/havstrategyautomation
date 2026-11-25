import type { UserRole } from "@/lib/db";
import type { Role } from "@/lib/access/types";

// The dashboard login has admin | manager | member; the Access Hub's permission table speaks super_admin | account_manager | team_member.
// A user with no role predates roles and keeps full access (admin).
export const toHubRole = (r: UserRole | undefined): Role => (r === "manager" ? "account_manager" : r === "member" ? "team_member" : "super_admin");
export const toMainRole = (r: Role): UserRole => (r === "account_manager" ? "manager" : r === "team_member" ? "member" : "admin");
