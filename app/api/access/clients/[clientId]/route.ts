import { NextResponse } from "next/server";
import { isResponse, withCapability, withSession } from "@/lib/access/api/guard";
import { parseBody } from "@/lib/access/api/validate";
import { updateClientSchema } from "@/lib/access/validation/client";
import { getClientById, updateClient } from "@/lib/access/db/queries/clients";
import { logAudit } from "@/lib/access/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const guard = await withSession();
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { clientId } = await params;

  const client = await getClientById(db, ctx.organizationId, clientId);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  return NextResponse.json(client);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const guard = await withCapability("edit_client");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { clientId } = await params;

  const parsed = await parseBody(req, updateClientSchema);
  if (!parsed.ok) return parsed.response;

  const existing = await getClientById(db, ctx.organizationId, clientId);
  if (!existing) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const patch = { ...parsed.data };
  if (patch.website === "") patch.website = undefined;

  const updated = await updateClient(db, ctx.organizationId, clientId, patch);
  await logAudit(db, { organizationId: ctx.organizationId, clientId, actorId: ctx.userId, actorType: "agency_user", action: "client.updated", metadata: { fields: Object.keys(patch) } });

  return NextResponse.json(updated);
}
