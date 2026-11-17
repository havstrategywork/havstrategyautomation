// Briefs from the dashboard chat -> clients + shortlists. The exact numbers (budgets per tier, follower range, message texts)
// are saved by the server straight from the form, so Cowork never has to retype them; Cowork adds niches/offer and finds creators.
import { ObjectId } from "mongodb";
import { db, inScope, ownerName, type BriefDoc, type ShortlistItem } from "./db";
import { cleanRows, clientFieldsFromBrief, type BriefInput } from "./brief";
import { upsertClient } from "./clients";
import { notify } from "./notify";


const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);

/** Saves the client and the brief. Cowork's scheduled "briefs" run picks it up (status "new"). */
export async function submitBrief(raw: BriefInput) {
  const b: BriefInput = {
    client: clip(raw.client, 80), currency: clip(raw.currency, 5) || "INR", other: clip(raw.other, 2000), message: clip(raw.message, 2000), followUp: clip(raw.followUp, 1000),
    products: (raw.products ?? []).slice(0, 20).map((p) => ({ name: clip(p.name, 80).trim(), about: clip(p.about, 200).trim() })).filter((p) => p.name),
    rows: cleanRows((raw.rows ?? []).slice(0, 5).map((r) => ({ tier: clip(r.tier, 12), count: Math.floor(Number(r.count)) || 0, budget: Number(r.budget) || 0 }))),
  };
  if (!b.products.length) throw new Error("add at least one product");
  const client = await upsertClient(clientFieldsFromBrief(b));
  const now = new Date();
  const doc: BriefDoc = { ...b, owner: ownerName() || undefined, createdAt: now, updatedAt: now, status: "new", clientId: client._id as ObjectId, shortlist: [], runs: 0 };
  return (await (await db()).briefs.insertOne(doc)).insertedId;
}

export const STALE_MS = 90 * 60e3; // a "shortlisting" claim older than this belongs to a crashed run
export const mine = () => (ownerName() ? { $or: [{ owner: ownerName() }, { owner: { $exists: false } }] } : {});

/** Cowork posts candidates. Only reachable, uncontacted creators this person may contact are kept; the rest come back with a reason. */
export async function addShortlist(briefId: ObjectId, items: { creatorId: string; tier?: string; score?: number; why?: string }[]) {
  const { briefs, creators, outreach } = await db();
  const brief = await briefs.findOne({ _id: briefId, ...mine() });
  if (!brief) return { error: "brief not found", status: 404 };
  const have = new Set(brief.shortlist.map((s) => String(s.creatorId)));
  const added: ShortlistItem[] = [], rejected: { creatorId: string; reason: string }[] = [];
  for (const it of items.slice(0, 200)) {
    if (!ObjectId.isValid(it.creatorId)) { rejected.push({ creatorId: it.creatorId, reason: "bad id" }); continue; }
    const id = new ObjectId(it.creatorId);
    const c = await creators.findOne({ _id: id });
    const reason = !c ? "creator not found" : !c.igHandle ? "no Instagram handle" : have.has(String(id)) ? "already on this shortlist"
      : !(await inScope(c, true)) ? "belongs to another person (OWNER)" : c.status === "Declined" ? "declined before"
      : (await outreach.findOne({ creatorId: id, kind: { $ne: "followup" }, status: { $in: ["queued", "sent"] } })) ? "already contacted" : "";
    if (reason) { rejected.push({ creatorId: it.creatorId, reason }); continue; }
    have.add(String(id));
    added.push({ creatorId: id, tier: clip(it.tier, 12) || "", ...(it.score != null && { score: Number(it.score) }), ...(it.why && { why: clip(it.why, 200) }) });
  }
  await briefs.updateOne({ _id: briefId }, { $push: { shortlist: { $each: added } }, $set: { status: "awaiting_approval", updatedAt: new Date() } });
  if (added.length) await notify(`Shortlist ready: ${brief.client}`, `${added.length} creators to approve. Open Campaigns in the dashboard.`);
  return { added: added.length, rejected };
}
