import { ObjectId } from "mongodb";
import { unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { mine, STALE_MS } from "@/lib/briefs";

// Cowork takes a "new" brief before working on it. Atomic: two runs can never process the same brief. 409 = someone else has it.
// A claim older than 90 min (the run crashed) can be taken again.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const bad = unauthorized(req); if (bad) return bad;
  const { id } = await params;
  if (!ObjectId.isValid(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const b = await (await db()).briefs.findOneAndUpdate({ _id: new ObjectId(id), $and: [{ $or: [{ status: "new" }, { status: "shortlisting", updatedAt: { $lt: new Date(Date.now() - STALE_MS) } }] }, mine()] }, { $set: { status: "shortlisting", updatedAt: new Date() }, $inc: { runs: 1 } }, { returnDocument: "after" });
  return b ? Response.json(b) : Response.json({ error: "not available (already claimed, or not new)" }, { status: 409 });
}
