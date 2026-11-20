import { ObjectId } from "mongodb";
import { unauthorized } from "@/lib/auth";
import { db, igAllowed } from "@/lib/db";

// body: { ok: true } or { ok: false, error }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const bad = unauthorized(req); if (bad) return bad;
  const { id } = await params;
  const b = await req.json().catch(() => ({ ok: true }));
  const { messages, creators } = await db();
  const m = await messages.findOne({ _id: new ObjectId(id), direction: "out" });
  if (!m) return Response.json({ error: "not found" }, { status: 404 });
  const c = await creators.findOne({ _id: m.creatorId });
  if (b.ok && !igAllowed(c?.igHandle)) return Response.json({ error: "recipient not in IG_ALLOWLIST (test mode)" }, { status: 403 });
  await messages.updateOne({ _id: m._id }, { $set: b.ok ? { status: "sent", at: new Date() } : { status: "failed", error: b.error ?? "unknown" } });
  return Response.json({ ok: true });
}
