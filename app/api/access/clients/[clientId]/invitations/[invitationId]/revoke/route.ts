import { NextResponse } from "next/server";
import { isResponse, withCapability } from "@/lib/access/api/guard";
import { getClientById } from "@/lib/access/db/queries/clients";
import { revokeInvitation } from "@/lib/access/db/queries/invitations";
import { logAudit } from "@/lib/access/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ clientId: string; invitationId: string }> }) {
  const guard = await withCapability("generate_invitation");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { clientId, invitationId } = await params;

  const client = await getClientById(db, ctx.organizationId, clientId);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  await revokeInvitation(db, invitationId);
  await logAudit(db, { organizationId: ctx.organizationId, clientId, actorId: ctx.userId, actorType: "agency_user", action: "invitation.revoked" });

  return NextResponse.json({ ok: true });
}
