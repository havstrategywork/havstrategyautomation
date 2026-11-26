import { NextResponse } from "next/server";
import { withDb, isResponse } from "@/lib/access/api/guard";
import { resolveInvitation } from "@/lib/access/public-onboarding";
import { getConnection } from "@/lib/access/db/queries/connections";
import { disconnectConnection } from "@/lib/access/integrations/oauth-flow";
import { isPlatform } from "@/lib/access/types";

/** Section 10/15/16: the client can revoke access at any time, from their own onboarding page. */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string; platform: string }> }) {
  const dbGuard = await withDb();
  if (isResponse(dbGuard)) return dbGuard;
  const { db } = dbGuard;
  const { token, platform } = await params;
  if (!isPlatform(platform)) return NextResponse.json({ error: "Unsupported platform." }, { status: 400 });

  const resolved = await resolveInvitation(db, token);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const connection = await getConnection(db, resolved.value.client.id, platform);
  if (!connection) return NextResponse.json({ error: "Nothing to revoke for this platform." }, { status: 404 });

  const result = await disconnectConnection(db, connection.id, { actorId: null, actorType: "client" });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ ok: true });
}
