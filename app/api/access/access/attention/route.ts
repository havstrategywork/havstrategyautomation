import { NextResponse } from "next/server";
import { isResponse, withSession } from "@/lib/access/api/guard";
import { listConnectionsNeedingAttention, toDisplayStatus } from "@/lib/access/db/queries/connections";

export async function GET() {
  const guard = await withSession();
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;

  const rows = await listConnectionsNeedingAttention(db, ctx.organizationId);
  return NextResponse.json(
    rows.map((r) => ({
      clientId: r.client.id,
      brandName: r.client.brandName,
      platform: r.connection.platform,
      displayStatus: toDisplayStatus(r.connection),
      connectionHealth: r.connection.connectionHealth,
      errorMessage: r.connection.errorMessage,
      lastVerifiedAt: r.connection.lastVerifiedAt,
    })),
  );
}
