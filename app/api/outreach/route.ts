import { ObjectId } from "mongodb";
import { unauthorized } from "@/lib/auth";
import { db, igAllowed, inScope, ownerName, type Outreach } from "@/lib/db";
import { firstName, render } from "@/lib/template";

export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const status = new URL(req.url).searchParams.get("status");
  return Response.json(await (await db()).outreach.find(status ? { status: status as Outreach["status"] } : {}).sort({ createdAt: -1 }).limit(200).toArray());
}

// body: { creatorId, clientId?, igMessage?, useTemplate?, name? }
// Queues an IG DM if the creator has a handle + igMessage. (Email outreach is switched off.)
// Skips channels already queued/sent for this creator (never double-contact someone).
export async function POST(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const b = await req.json();
  const { creators, outreach, clients } = await db();
  const creatorId = new ObjectId(b.creatorId);
  const c = await creators.findOne({ _id: creatorId });
  if (!c) return Response.json({ error: "creator not found" }, { status: 404 });
  if (!(await inScope(c, true))) return Response.json({ error: "creator belongs to another person (OWNER); leave them to their owner" }, { status: 403 });
  // useTemplate: send the client's pasted message verbatim Only {{name}}/{{handle}} change; `name` overrides the greeting name.
  if (b.useTemplate) {
    const cl = b.clientId && ObjectId.isValid(b.clientId) ? await clients.findOne({ _id: new ObjectId(b.clientId) }) : null;
    if (!cl?.dmTemplate) return Response.json({ error: "client has no dmTemplate; save one on the client first" }, { status: 400 });
    try {
      b.igMessage = render(cl.dmTemplate, { name: String(b.name ?? "").trim() || firstName(c.name), handle: c.igHandle ? `@${c.igHandle}` : "" });
    } catch (e) { return Response.json({ error: (e as Error).message }, { status: 422 }); }
  }
  const base = { creatorId, ...(b.clientId && { clientId: new ObjectId(b.clientId) }), status: "queued" as const, createdAt: new Date() };
  const wants: Pick<Outreach, "channel" | "message" | "subject">[] = [];
  if (c.igHandle && b.igMessage) wants.push({ channel: "ig", message: b.igMessage });
  const queued = [], skipped = [];
  for (const w of wants) {
    const testRecipient = w.channel === "ig" && !!process.env.IG_ALLOWLIST && igAllowed(c.igHandle); // test mode may re-send to the allowlisted account
    if (!testRecipient && (await outreach.findOne({ creatorId, channel: w.channel, status: { $in: ["queued", "sent"] } }))) { skipped.push(w.channel); continue; }
    const doc = { ...base, ...w };
    queued.push({ ...doc, _id: (await outreach.insertOne(doc)).insertedId });
  }
  if (queued.length && ownerName() && !c.owner) await creators.updateOne({ _id: creatorId }, { $set: { owner: ownerName() } }); // claim the creator
  if (b.clientId) await creators.updateOne({ _id: creatorId }, { $addToSet: { suggestedVia: new ObjectId(b.clientId) } }); // queuing for a client = suggesting them
  return Response.json({ queued, skipped });
}
