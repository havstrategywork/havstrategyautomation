import type { AnyDb } from "@/lib/access/db";
import { createInvitation, getLatestInvitationForClient, revokeInvitation } from "@/lib/access/db/queries/invitations";
import { ensureConnectionShell } from "@/lib/access/db/queries/connections";
import { logAudit, trackEvent } from "@/lib/access/audit";
import { notify } from "@/lib/access/notifications";
import { getAppUrl } from "@/lib/access/env";
import type { Client } from "@/lib/access/db/schema-types";

/** Shared by POST /invitations (first send) and .../remind|regenerate (later sends) - see section 8's distinct "Copy link" vs "Regenerate invitation" actions. */
export async function generateInvitation(
  db: AnyDb,
  input: { organizationId: string; client: Client; requestedPlatforms: string[]; personalizedMessage?: string | null; expiryDays?: number; createdBy: string; notifyClient?: boolean },
) {
  const { id, rawToken } = await createInvitation(db, {
    clientId: input.client.id,
    requestedPlatforms: input.requestedPlatforms,
    personalizedMessage: input.personalizedMessage ?? null,
    expiryDays: input.expiryDays ?? 14,
    createdBy: input.createdBy,
  });

  for (const platform of input.requestedPlatforms) {
    await ensureConnectionShell(db, { organizationId: input.organizationId, clientId: input.client.id, platform });
  }

  const onboardingUrl = `${getAppUrl()}/access/onboard/${rawToken}`;

  await logAudit(db, { organizationId: input.organizationId, clientId: input.client.id, actorId: input.createdBy, actorType: "agency_user", action: "invitation.generated", metadata: { platforms: input.requestedPlatforms } });
  await trackEvent(db, { organizationId: input.organizationId, clientId: input.client.id, eventType: "onboarding_link_generated" });

  if (input.notifyClient !== false) {
    await notify(db, {
      organizationId: input.organizationId,
      clientId: input.client.id,
      type: "new_invitation",
      recipients: [{ kind: "client", email: input.client.contactEmail }],
      context: { brandName: input.client.brandName, onboardingUrl },
    });
  }

  return { id, url: onboardingUrl };
}

/** Revokes the client's current invitation (if any) and issues a fresh one with the same requested platforms. */
export async function regenerateInvitation(db: AnyDb, organizationId: string, client: Client, actorId: string) {
  const current = await getLatestInvitationForClient(db, client.id);
  if (current) await revokeInvitation(db, current.id);

  const requestedPlatforms = (current?.requestedPlatforms as string[] | undefined)?.length
    ? (current!.requestedPlatforms as string[])
    : (client.requiredPlatforms as string[]);

  return generateInvitation(db, { organizationId, client, requestedPlatforms, createdBy: actorId, notifyClient: false });
}
