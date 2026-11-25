import { NextResponse } from "next/server";
import { isResponse, withSession } from "@/lib/access/api/guard";
import { countUnread, listNotificationsForUser } from "@/lib/access/db/queries/notifications";

export async function GET() {
  const guard = await withSession();
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;

  const [items, unread] = await Promise.all([
    listNotificationsForUser(db, ctx.organizationId, ctx.userId),
    countUnread(db, ctx.organizationId, ctx.userId),
  ]);

  return NextResponse.json({ items, unread });
}
