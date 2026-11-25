import type { AnyDb } from "@/lib/access/db";
import { getInvitationByRawToken, invitationIsUsable } from "@/lib/access/db/queries/invitations";
import { getClientByIdTrusted } from "@/lib/access/db/queries/clients";
import { getOrganizationById } from "@/lib/access/db/queries/organizations";
import type { Client, OnboardingInvitation, Organization } from "@/lib/access/db/schema-types";

export interface ResolvedInvitation {
  invitation: OnboardingInvitation;
  client: Client;
  organization: Organization;
}

export type ResolveResult = { ok: true; value: ResolvedInvitation } | { ok: false; status: number; error: string };

/**
 * Every public /api/public/onboard/[token]/* route starts here. Token
 * lookup is by hash (lib/crypto/tokens.ts hashToken) - a wrong or guessed
 * token simply finds no row, which reads identically to "expired" from the
 * outside (no information leak about which tokens are real). The client id
 * comes only from the invitation's own client_id FK - see
 * getClientByIdTrusted for why that's the one safe unscoped lookup.
 */
export async function resolveInvitation(db: AnyDb, rawToken: string): Promise<ResolveResult> {
  const invitation = await getInvitationByRawToken(db, rawToken);
  if (!invitation) return { ok: false, status: 404, error: "This onboarding link is invalid." };
  if (!invitationIsUsable(invitation)) {
    return {
      ok: false,
      status: 410,
      error: invitation.revokedAt ? "This onboarding link has been revoked." : "This onboarding link has expired. Ask the agency to send a new one.",
    };
  }

  const client = await getClientByIdTrusted(db, invitation.clientId);
  if (!client || client.archivedAt) return { ok: false, status: 404, error: "This client is no longer active." };

  const organization = await getOrganizationById(db, client.organizationId);
  if (!organization) return { ok: false, status: 404, error: "Agency organization not found." };

  return { ok: true, value: { invitation, client, organization } };
}
