import { ObjectId } from "mongodb";
import { unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { markUndelivered } from "@/lib/outreach";

// body: { reason }. The replies run saw Instagram's "not delivered" / "can't receive your message" marker on our first DM in this creator's chat.
// The DM is re-recorded as failed, follow-ups stop, and the creator is kept out of future shortlists. Safe to call twice.
export async function POST(req: Request, { params }: { params: Promise<{ creatorId: string }> }) {
  const bad = unauthorized(req); if (bad) return bad;
  const { creatorId } = await params;
  if (!ObjectId.isValid(creatorId)) return Response.json({ error: "bad id" }, { status: 400 });
  const { reason } = await req.json().catch(() => ({ reason: "" }));
  const c = await (await db()).creators.findOne({ _id: new ObjectId(creatorId) });
  if (!c) return Response.json({ error: "not found" }, { status: 404 });
  await markUndelivered(c._id!, String(reason || "not delivered"));
  return Response.json({ ok: true });
}
