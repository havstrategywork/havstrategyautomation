import { NextResponse } from "next/server";
import { isResponse, withSession } from "@/lib/access/api/guard";
import { getDashboardKpis } from "@/lib/access/db/queries/clients";

export async function GET() {
  const guard = await withSession();
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;

  const kpis = await getDashboardKpis(db, ctx.organizationId);
  return NextResponse.json(kpis);
}
