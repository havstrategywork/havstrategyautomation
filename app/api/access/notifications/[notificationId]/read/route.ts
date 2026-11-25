import { NextResponse } from "next/server";
import { isResponse, withSession } from "@/lib/access/api/guard";
import { markNotificationRead } from "@/lib/access/db/queries/notifications";

export async function POST(_req: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  const guard = await withSession();
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { notificationId } = await params;

  await markNotificationRead(db, notificationId, ctx.userId);
  return NextResponse.json({ ok: true });
}
