import { ObjectId } from "mongodb";
import { unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";

// body: { reason }. Hands the thread to a human: Claude must stop replying; it shows under "Needs you" on /inbox.
export async function POST(req: Request, { params }: { params: Promise<{ creatorId: string }> }) {
  const bad = unauthorized(req); if (bad) return bad;
  const { creatorId } = await params;
  const { reason } = await req.json().catch(() => ({ reason: "" }));
  const { creators, messages } = await db();
  const r = await creators.updateOne({ _id: new ObjectId(creatorId) }, { $set: { needsHuman: { reason: String(reason || "unspecified"), at: new Date() } } });
  if (!r.matchedCount) return Response.json({ error: "not found" }, { status: 404 });
  await messages.updateMany({ creatorId: new ObjectId(creatorId), direction: "out", status: "queued" }, { $set: { status: "failed", error: "escalated before sending" } });
  const c = await creators.findOne({ _id: new ObjectId(creatorId) });
  await notify(`Needs you: @${c?.igHandle ?? creatorId}`, `${String(reason || "unspecified").slice(0, 300)}
Open Inbox in the dashboard.`);
  return Response.json({ ok: true });
}
