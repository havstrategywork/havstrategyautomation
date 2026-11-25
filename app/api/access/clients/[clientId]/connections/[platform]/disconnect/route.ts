import { NextResponse } from "next/server";
import { isResponse, withCapability } from "@/lib/access/api/guard";
import { getClientById } from "@/lib/access/db/queries/clients";
import { getConnection } from "@/lib/access/db/queries/connections";
import { disconnectConnection } from "@/lib/access/integrations/oauth-flow";

export async function POST(_req: Request, { params }: { params: Promise<{ clientId: string; platform: string }> }) {
  const guard = await withCapability("disconnect_or_revoke");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { clientId, platform } = await params;

  const client = await getClientById(db, ctx.organizationId, clientId);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const connection = await getConnection(db, clientId, platform);
  if (!connection) return NextResponse.json({ error: "Connection not found." }, { status: 404 });

  const result = await disconnectConnection(db, connection.id, { actorId: ctx.userId, actorType: "agency_user" });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ ok: true });
}
