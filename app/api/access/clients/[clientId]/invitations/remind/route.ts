import { NextResponse } from "next/server";
import { isResponse, withCapability } from "@/lib/access/api/guard";
import { getClientById } from "@/lib/access/db/queries/clients";
import { notify } from "@/lib/access/notifications";
import { logAudit } from "@/lib/access/audit";

/**
 * Section 8: "Send reminders". Nudges the client without a link (the
 * original raw invitation token is not recoverable - only its hash is
 * stored). To resend with a working link, use .../invitations/regenerate.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const guard = await withCapability("send_reminder");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { clientId } = await params;

  const client = await getClientById(db, ctx.organizationId, clientId);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  await notify(db, {
    organizationId: ctx.organizationId,
    clientId,
    type: "new_invitation",
    recipients: [{ kind: "client", email: client.contactEmail }],
    context: { brandName: client.brandName },
  });

  await logAudit(db, { organizationId: ctx.organizationId, clientId, actorId: ctx.userId, actorType: "agency_user", action: "invitation.reminder_sent" });

  return NextResponse.json({ ok: true });
}
