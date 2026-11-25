import type { Role } from "@/lib/access/types";
import type { AuthContext } from "./session";

/**
 * Role-based access control (section 4). Kept as one small declarative
 * table rather than scattered checks, so the permission set for a role is
 * visible in one place.
 *
 * team_member is intentionally read-only everywhere in the MVP (no
 * per-team-member client assignment exists yet beyond `assigned_manager_id`
 * - see KNOWN_LIMITATIONS.md). It can view every client in its organization
 * but never mutate anything, and - like every role - can never read a raw
 * OAuth token: encrypted_credentials is never returned by any API regardless
 * of role.
 */
const CAPABILITIES = {
  create_client: ["super_admin", "account_manager"],
  edit_client: ["super_admin", "account_manager"],
  archive_client: ["super_admin", "account_manager"],
  generate_invitation: ["super_admin", "account_manager"],
  send_reminder: ["super_admin", "account_manager"],
  disconnect_or_revoke: ["super_admin", "account_manager"],
  verify_connection: ["super_admin", "account_manager"],
  manage_team: ["super_admin"],
  configure_integrations: ["super_admin"],
  manage_org_settings: ["super_admin"],
  view_security_logs: ["super_admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: Role, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly Role[]).includes(role);
}

export function requireCapability(ctx: AuthContext, capability: Capability): { ok: true } | { ok: false; status: number; error: string } {
  if (can(ctx.role, capability)) return { ok: true };
  return { ok: false, status: 403, error: `Your role (${ctx.role}) cannot perform this action.` };
}
