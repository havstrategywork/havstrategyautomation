import { NextResponse } from "next/server";
import { isResponse, withCapability } from "@/lib/access/api/guard";
import { getClientById, unarchiveClient } from "@/lib/access/db/queries/clients";
import { logAudit } from "@/lib/access/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const guard = await withCapability("archive_client");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { clientId } = await params;

  const client = await getClientById(db, ctx.organizationId, clientId);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  await unarchiveClient(db, ctx.organizationId, clientId);
  await logAudit(db, { organizationId: ctx.organizationId, clientId, actorId: ctx.userId, actorType: "agency_user", action: "client.unarchived" });

  return NextResponse.json({ ok: true });
}
