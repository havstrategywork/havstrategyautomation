import { unauthorized } from "@/lib/auth";
import { db, type BriefDoc } from "@/lib/db";
import { STALE_MS } from "@/lib/briefs";

// ?status=new (default). Briefs submitted from the dashboard chat, oldest first.
export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const status = (new URL(req.url).searchParams.get("status") ?? "new") as BriefDoc["status"];
  const { briefs, clients } = await db();
  // "new" also lists briefs whose run crashed mid-way (claimed > 90 min ago), so they get picked up again
  const filter = status === "new" ? { $or: [{ status: "new" as const }, { status: "shortlisting" as const, updatedAt: { $lt: new Date(Date.now() - STALE_MS) } }] } : { status };
  const rows = await briefs.find(filter).sort({ createdAt: 1 }).limit(20).toArray();
  return Response.json(await Promise.all(rows.map(async (b) => ({ ...b, clientDoc: b.clientId ? await clients.findOne({ _id: b.clientId }) : null }))));
}
