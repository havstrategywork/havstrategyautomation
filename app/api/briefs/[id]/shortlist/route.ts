import { ObjectId } from "mongodb";
import { unauthorized } from "@/lib/auth";
import { addShortlist } from "@/lib/briefs";

// body: { items: [{ creatorId, tier, score?, why? }] }. Adds candidates and moves the brief to "awaiting_approval". If the client has a saved message and AUTO_APPROVE is not "off",
// the DMs are queued right away (reply has autoApproved:true); otherwise you get a ping to approve it in the dashboard.
// Creators that can't be contacted are refused with a reason (already contacted, someone else's, no IG handle...).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const bad = unauthorized(req); if (bad) return bad;
  const { id } = await params;
  if (!ObjectId.isValid(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const { items } = await req.json().catch(() => ({ items: [] }));
  if (!Array.isArray(items) || !items.length) return Response.json({ error: "items[] required" }, { status: 400 });
  const r = await addShortlist(new ObjectId(id), items);
  return "error" in r ? Response.json({ error: r.error }, { status: r.status }) : Response.json(r);
}
