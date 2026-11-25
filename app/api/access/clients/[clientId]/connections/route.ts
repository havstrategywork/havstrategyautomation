import { NextResponse } from "next/server";
import { isResponse, withSession } from "@/lib/access/api/guard";
import { getClientById } from "@/lib/access/db/queries/clients";
import { listAssetsForConnection, listConnectionsForClient, toDisplayStatus } from "@/lib/access/db/queries/connections";

export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const guard = await withSession();
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { clientId } = await params;

  const client = await getClientById(db, ctx.organizationId, clientId);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const connections = await listConnectionsForClient(db, clientId);
  const withAssets = await Promise.all(
    connections.map(async (c) => ({
      ...c,
      tokenReference: undefined,
      displayStatus: toDisplayStatus(c),
      assets: await listAssetsForConnection(db, c.id),
    })),
  );

  return NextResponse.json(withAssets);
}
