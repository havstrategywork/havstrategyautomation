import { unauthorized } from "@/lib/auth";
import { db, type Outreach } from "@/lib/db";
import { queueFirstDm } from "@/lib/outreach";

export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const u = new URL(req.url).searchParams;
  const status = u.get("status");
  const page = u.get("page") ? Number(u.get("page")) : undefined;
  const limit = u.get("limit") ? Number(u.get("limit")) : (page ? 15 : 200);
  const filter = status ? { status: status as Outreach["status"] } : {};
  const query = (await db()).outreach.find(filter).sort({ createdAt: -1 });
  if (page) query.skip((page - 1) * limit);
  return Response.json(await query.limit(limit).toArray());
}

// body: { creatorId, clientId?, igMessage?, useTemplate?, name? }. Queues a first IG DM (rules in lib/outreach.ts). Email outreach is off.
export async function POST(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const r = await queueFirstDm(await req.json());
  return r.error ? Response.json({ error: r.error }, { status: r.status }) : Response.json({ queued: r.queued, skipped: r.skipped });
}
