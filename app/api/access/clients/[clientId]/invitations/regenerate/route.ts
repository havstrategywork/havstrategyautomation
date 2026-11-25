import { NextResponse } from "next/server";
import { isResponse, withCapability } from "@/lib/access/api/guard";
import { getClientById } from "@/lib/access/db/queries/clients";
import { regenerateInvitation } from "@/lib/access/onboarding";
import { logAudit } from "@/lib/access/audit";

/** Section 8: "Regenerate invitation" - revokes the client's current link (if any) and issues a fresh, copyable one using the same requested platforms. */
export async function POST(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const guard = await withCapability("generate_invitation");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { clientId } = await params;

  const client = await getClientById(db, ctx.organizationId, clientId);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const result = await regenerateInvitation(db, ctx.organizationId, client, ctx.userId);
  await logAudit(db, { organizationId: ctx.organizationId, clientId, actorId: ctx.userId, actorType: "agency_user", action: "invitation.regenerated" });

  return NextResponse.json({ id: result.id, url: result.url });
}
