// Briefs from the dashboard chat -> clients + shortlists. The exact numbers (budgets per tier, follower range, message texts)
// are saved by the server straight from the form, so Cowork never has to retype them; Cowork adds niches/offer and finds creators.
import { ObjectId } from "mongodb";
import { db, inScope, ownerName, type BriefDoc, type ShortlistItem } from "./db";
import { cleanRows, clientFieldsFromBrief, type BriefInput } from "./brief";
import { upsertClient } from "./clients";
import { notify } from "./notify";
import { queueFirstDm } from "./outreach";


const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);

/** Saves the client and the brief. Cowork's scheduled "briefs" run picks it up (status "new"). */
export async function submitBrief(raw: BriefInput) {
  const b: BriefInput = {
    client: clip(raw.client, 80), currency: clip(raw.currency, 5) || "INR", other: clip(raw.other, 2000), message: clip(raw.message, 2000), followUp: clip(raw.followUp, 4000), sheetUrl: clip(raw.sheetUrl, 300).trim() || undefined,
    products: (raw.products ?? []).slice(0, 20).map((p) => ({ name: clip(p.name, 80).trim(), about: clip(p.about, 200).trim() })).filter((p) => p.name),
    rows: cleanRows((raw.rows ?? []).slice(0, 5).map((r) => ({ tier: clip(r.tier, 12), count: Math.floor(Number(r.count)) || 0, budget: Number(r.budget) || 0 }))),
  };
  if (!b.products.length) throw new Error("add at least one product");
  const client = await upsertClient(clientFieldsFromBrief(b));
  const now = new Date();
  const doc: BriefDoc = { ...b, owner: ownerName() || undefined, createdAt: now, updatedAt: now, status: "new", clientId: client._id as ObjectId, shortlist: [], runs: 0 };
  return (await (await db()).briefs.insertOne(doc)).insertedId;
}

/** Edits an existing campaign's core details and re-syncs the client's budgets/follower-range/message fields from them.
 *  Updates the client by its known id, not by name (upsertClient matches by name, which would create a stray second client if the brand name changed here). */
export async function editBrief(briefId: ObjectId, raw: BriefInput) {
  const b: BriefInput = {
    client: clip(raw.client, 80), currency: clip(raw.currency, 5) || "INR", other: clip(raw.other, 2000), message: clip(raw.message, 2000), followUp: clip(raw.followUp, 4000), sheetUrl: clip(raw.sheetUrl, 300).trim() || undefined,
    products: (raw.products ?? []).slice(0, 20).map((p) => ({ name: clip(p.name, 80).trim(), about: clip(p.about, 200).trim() })).filter((p) => p.name),
    rows: cleanRows((raw.rows ?? []).slice(0, 5).map((r) => ({ tier: clip(r.tier, 12), count: Math.floor(Number(r.count)) || 0, budget: Number(r.budget) || 0 }))),
  };
  if (!b.products.length) throw new Error("add at least one product");
  const { briefs, clients } = await db();
  const existing = await briefs.findOne({ _id: briefId, ...mine() });
  if (!existing) throw new Error("campaign not found");
  if (existing.clientId) await clients.updateOne({ _id: existing.clientId }, { $set: clientFieldsFromBrief(b) });
  await briefs.updateOne({ _id: briefId }, { $set: { ...b, updatedAt: new Date() } });
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
      : !(await inScope(c, true)) ? "belongs to another person (OWNER)" : c.status === "Declined" ? "declined before" : c.undeliverable ? "can't receive our DMs (not delivered before)"
      : (await outreach.findOne({ creatorId: id, kind: { $ne: "followup" }, status: { $in: ["queued", "sent"] } })) ? "already contacted" : "";
    if (reason) { rejected.push({ creatorId: it.creatorId, reason }); continue; }
    have.add(String(id));
    added.push({ creatorId: id, tier: clip(it.tier, 12) || "", ...(it.score != null && { score: Number(it.score) }), ...(it.why && { why: clip(it.why, 200) }) });
  }
  if (!added.length) return { added: 0, rejected, autoApproved: false }; // nothing usable: leave the brief as it is (an approved one must not flip back to "needs approval")
  await briefs.updateOne({ _id: briefId }, { $push: { shortlist: { $each: added } }, $set: { status: "awaiting_approval", updatedAt: new Date() } });
  const auto = added.length ? await autoApprove(briefId) : null;
  if (added.length && !auto?.ok) await notify(`Shortlist ready: ${brief.client}`, `${added.length} creators to approve. ${auto ? auto.why + " " : ""}Open Campaigns in the dashboard.`);
  return { added: added.length, rejected, autoApproved: !!auto?.ok };
}

export const AUTO_APPROVE = process.env.AUTO_APPROVE !== "off"; // on by default; AUTO_APPROVE=off puts the human approval step back

/** Queues the first DM for every undecided shortlist item that isPicked accepts and marks the rest rejected. Shared by the dashboard's Approve button and auto-approval. */
export async function queueShortlist(b: BriefDoc, isPicked: (s: ShortlistItem) => boolean) {
  let queued = 0, skipped = 0;
  const shortlist: ShortlistItem[] = [];
  for (const s of b.shortlist) {
    if (s.decision) { shortlist.push(s); continue; } // decided in an earlier round
    if (!isPicked(s)) { shortlist.push({ ...s, decision: "rejected" }); continue; }
    const r = await queueFirstDm({ creatorId: s.creatorId, clientId: b.clientId, useTemplate: true });
    if (r.queued.length) queued++; else skipped++;
    shortlist.push({ ...s, decision: "approved" });
  }
  return { queued, skipped, shortlist };
}

/** No human gate: when the client has the user's own saved message (dmTemplate), every shortlisted creator gets that DM queued right away (the send run delivers it, 75 a day).
 *  Without a saved message nobody has written the text, so a human still has to approve (and write or accept the draft). */
export async function autoApprove(briefId: ObjectId): Promise<{ ok: true } | { ok: false; why: string }> {
  if (!AUTO_APPROVE) return { ok: false, why: "Auto-approve is off." };
  const { briefs, clients } = await db();
  const b = await briefs.findOne({ _id: briefId, status: "awaiting_approval" });
  const cl = b?.clientId && (await clients.findOne({ _id: b.clientId }));
  if (!b || !cl) return { ok: false, why: "Brief not found." };
  if (!cl.dmTemplate?.trim()) return { ok: false, why: "No saved message for this client, so it needs your approval of the wording." };
  const { queued, skipped, shortlist } = await queueShortlist(b, () => true);
  await briefs.updateOne({ _id: briefId }, { $set: { shortlist, status: "approved", updatedAt: new Date(), note: `Auto-approved: ${queued} DM${queued === 1 ? "" : "s"} queued${skipped ? `, ${skipped} skipped (already contacted or no handle)` : ""}. The scheduled sender delivers them (75 a day).` } });
  await notify(`Auto-approved: ${b.client}`, `${queued} DMs queued with your saved message. The send run delivers them (75 a day).`);
  return { ok: true };
}
