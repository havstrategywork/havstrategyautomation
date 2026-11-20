import { ObjectId } from "mongodb";
import { unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";

// Cowork reports on a brief it claimed. body: { draftMessage?, note?, status?: "failed" }
// (Approval, "find more" and archiving are dashboard-only: a human does those.)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const bad = unauthorized(req); if (bad) return bad;
  const { id } = await params;
  if (!ObjectId.isValid(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (b.draftMessage != null) set.draftMessage = String(b.draftMessage).slice(0, 2000);
  if (b.note != null) set.note = String(b.note).slice(0, 1000);
  if (b.status === "failed") set.status = "failed";
  else if (b.status != null) return Response.json({ error: 'only status "failed" can be set here' }, { status: 400 });
  const r = await (await db()).briefs.findOneAndUpdate({ _id: new ObjectId(id) }, { $set: set }, { returnDocument: "after" });
  if (!r) return Response.json({ error: "not found" }, { status: 404 });
  if (set.status === "failed") await notify(`Brief failed: ${r.client}`, String(set.note ?? ""));
  return Response.json(r);
}
