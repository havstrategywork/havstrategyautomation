import { ObjectId } from "mongodb";
import { unauthorized } from "@/lib/auth";
import { db, IG_CAP, igAllowed, inScope, sentToday } from "@/lib/db";

// body: { ok: true } or { ok: false, error: "..." }. The cap is enforced here too, not just in /next.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const bad = unauthorized(req); if (bad) return bad;
  const { id } = await params;
  const b = await req.json().catch(() => ({ ok: true }));
  const { outreach, creators } = await db();
  const o = await outreach.findOne({ _id: new ObjectId(id) });
  if (!o) return Response.json({ error: "not found" }, { status: 404 });
  if (b.ok && o.channel === "ig" && !(await inScope(await creators.findOne({ _id: o.creatorId })))) return Response.json({ error: "creator belongs to another person (OWNER)" }, { status: 403 });
  if (b.ok && o.channel === "ig" && !igAllowed((await creators.findOne({ _id: o.creatorId }))?.igHandle)) return Response.json({ error: "recipient not in IG_ALLOWLIST (test mode)" }, { status: 403 });
  if (b.ok && o.channel === "ig" && (await sentToday("ig")) >= IG_CAP) return Response.json({ error: "daily IG cap reached" }, { status: 429 });
  await outreach.updateOne({ _id: o._id }, { $set: b.ok ? { status: "sent", sentAt: new Date() } : { status: "failed", error: b.error ?? "unknown" } });
  if (b.ok && o.channel === "ig") {
    await creators.updateOne({ _id: o.creatorId }, { $set: { dmSentAt: new Date() } });
    await creators.updateOne({ _id: o.creatorId, $or: [{ status: "New" }, { status: { $exists: false } }] }, { $set: { status: "DM Sent" } });
  }
  return Response.json({ ok: true });
}
