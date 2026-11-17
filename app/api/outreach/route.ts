import { unauthorized } from "@/lib/auth";
import { db, type Outreach } from "@/lib/db";
import { queueFirstDm } from "@/lib/outreach";

export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const status = new URL(req.url).searchParams.get("status");
  return Response.json(await (await db()).outreach.find(status ? { status: status as Outreach["status"] } : {}).sort({ createdAt: -1 }).limit(200).toArray());
}

// body: { creatorId, clientId?, igMessage?, useTemplate?, name? }. Queues a first IG DM (rules in lib/outreach.ts). Email outreach is off.
export async function POST(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const r = await queueFirstDm(await req.json());
  return r.error ? Response.json({ error: r.error }, { status: r.status }) : Response.json({ queued: r.queued, skipped: r.skipped });
}
