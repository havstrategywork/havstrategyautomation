import { NextResponse } from "next/server";
import { isResponse, withSession } from "@/lib/access/api/guard";
import { listAuditLogs } from "@/lib/access/db/queries/audit";

export async function GET(req: Request) {
  const guard = await withSession();
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") ?? undefined;
  const limit = url.searchParams.get("limit");

  const logs = await listAuditLogs(db, ctx.organizationId, { clientId, limit: limit ? Number(limit) : undefined });
  return NextResponse.json(logs);
}
