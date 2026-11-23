// Dashboard roles. Pure (no imports) so the proxy, the layout, the pages and the tests share one rule.
// admin = everything (a user with no role saved is admin: the logins that existed before roles). outreach = the creator pages.
// mail = the Email dashboard only. social = the social-media team: /social/* only (reports, chat bots), no org management.
export const ROLES = ["admin", "outreach", "mail", "social"] as const;
export type Role = (typeof ROLES)[number];
export const roleOf = (r?: string): Role => (ROLES as readonly string[]).includes(r ?? "") ? (r as Role) : "admin";

const under = (p: string, base: string) => p === base || p.startsWith(`${base}/`);
const ADMIN_ONLY = ["/users", "/automation", "/social/orgs"];

/** May this role open this dashboard path? (/login/* is always allowed: logout must work for everyone.) */
export function canView(role: Role, p: string) {
  if (under(p, "/login")) return true;
  if (role === "admin") return true;
  if (ADMIN_ONLY.some((b) => under(p, b))) return false;
  if (role === "mail") return under(p, "/mail");
  if (role === "social") return under(p, "/social");
  return !under(p, "/mail") && !under(p, "/social"); // outreach
}
/** Where a role lands after login, or when it opens a page it can't see. */
export const homeFor = (role: Role) => (role === "mail" ? "/mail" : role === "social" ? "/social/reports" : "/");
/** Roles that may hold the outreach API key in the page (the brief chat carries it). */
export const hasApiKey = (role: Role) => role === "admin" || role === "outreach";
