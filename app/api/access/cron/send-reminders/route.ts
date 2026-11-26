import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/access/api/cron-guard";
import { getDb } from "@/lib/access/db";
import { listPendingInvitationsWithClients } from "@/lib/access/db/queries/invitations";
import { notify } from "@/lib/access/notifications";

const STALL_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days with no completion

/** Section 17: "Configurable reminder schedules" for invitations the client hasn't finished. Dedup (24h) is handled inside notify(). */
export async function POST(req: Request) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const dbResult = await getDb();
  if (!dbResult.ok) return NextResponse.json({ error: dbResult.error }, { status: 503 });
  const db = dbResult.db;

  const stalledCutoff = new Date(Date.now() - STALL_THRESHOLD_MS);
  const candidates = await listPendingInvitationsWithClients(db, { extra: { expiresAt: { $gt: new Date() }, createdAt: { $lt: stalledCutoff } } });

  let reminded = 0;
  for (const { client } of candidates) {
    await notify(db, {
      organizationId: client.organizationId,
      clientId: client.id,
      type: "new_invitation",
      recipients: [{ kind: "client", email: client.contactEmail }],
      context: { brandName: client.brandName },
    });
    reminded += 1;
  }

  return NextResponse.json({ ok: true, candidates: candidates.length, reminded });
}
