import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import { exportCsv } from "@/lib/csv";
import { mine } from "@/lib/briefs";

export const dynamic = "force-dynamic";

// NOT under /api/: behind the login proxy automatically, same as /creators/export. Exports this ONE campaign's shortlist
// (every tier/status, not just "Approved"), same columns as the Creators page export.
export async function GET(_req: Request, { params }: { params: Promise<{ briefId: string }> }) {
  const { briefId } = await params;
  if (!ObjectId.isValid(briefId)) return new Response("bad id", { status: 400 });
  const { briefs, creators, clients } = await db();
  const b = await briefs.findOne({ _id: new ObjectId(briefId), ...mine() });
  if (!b) return new Response("not found", { status: 404 });
  const names = new Map((await clients.find().toArray()).map((c) => [String(c._id), c.name]));
  const rows = await creators.find({ _id: { $in: b.shortlist.map((s) => s.creatorId) } }).toArray();
  const body = exportCsv(rows, (id) => names.get(String(id)) ?? String(id));
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${b.client.replace(/[^\w .-]/g, "_")}-shortlist.csv"`,
    },
  });
}
