// Queueing Instagram DMs. One place for the rules, used by the API (Cowork) and by the dashboard's "Approve" button.
import { ObjectId } from "mongodb";
import { db, igAllowed, inScope, ownerName, type Creator } from "./db";
import { firstName, render } from "./template";
import { DAY, FOLLOWUP_SCHEDULE, nextStep, stepTexts } from "./followup";
import { notify } from "./notify";

export { FOLLOWUP_SCHEDULE };


type QueueIn = { creatorId: string | ObjectId; clientId?: string | ObjectId; igMessage?: string; useTemplate?: boolean; name?: string };
type QueueOut = { queued: unknown[]; skipped: string[]; error?: string; status?: number };

/** Queues the FIRST DM to a creator. Never double-contacts: skips anyone already queued or sent a first DM (for any client). */
export async function queueFirstDm(b: QueueIn): Promise<QueueOut> {
  const { creators, outreach, clients } = await db();
  const creatorId = new ObjectId(b.creatorId);
  const clientId = b.clientId && ObjectId.isValid(b.clientId) ? new ObjectId(b.clientId) : undefined;
  const c = await creators.findOne({ _id: creatorId });
  if (!c) return { queued: [], skipped: [], error: "creator not found", status: 404 };
  if (!(await inScope(c, true))) return { queued: [], skipped: [], error: "creator belongs to another person (OWNER); leave them to their owner", status: 403 };
  const greet = String(b.name ?? "").trim() || firstName(c.name);
  let message = b.igMessage;
  if (b.useTemplate) { // the client's pasted message, word for word: only {{name}}/{{handle}} change
    const cl = clientId ? await clients.findOne({ _id: clientId }) : null;
    if (!cl?.dmTemplate) return { queued: [], skipped: [], error: "client has no dmTemplate; save one on the client first", status: 400 };
    try { message = render(cl.dmTemplate, { name: greet, handle: c.igHandle ? `@${c.igHandle}` : "" }); }
    catch (e) { return { queued: [], skipped: [], error: (e as Error).message, status: 422 }; }
  }
  if (!c.igHandle || !message) return { queued: [], skipped: ["ig"] };
  const testRecipient = !!process.env.IG_ALLOWLIST && igAllowed(c.igHandle); // test mode may re-send to the allowlisted account
  if (!testRecipient && (await outreach.findOne({ creatorId, channel: "ig", kind: { $ne: "followup" }, status: { $in: ["queued", "sent"] } }))) return { queued: [], skipped: ["ig"] };
  const doc = { creatorId, ...(clientId && { clientId }), channel: "ig" as const, kind: "first" as const, greet, message, status: "queued" as const, createdAt: new Date() };
  const queued = [{ ...doc, _id: (await outreach.insertOne(doc)).insertedId }];
  if (ownerName() && !c.owner) await creators.updateOne({ _id: creatorId }, { $set: { owner: ownerName() } }); // claim the creator
  if (clientId) await creators.updateOne({ _id: creatorId }, { $addToSet: { suggestedVia: clientId } }); // queuing for a client = suggesting them
  return { queued, skipped: [] };
}


/** Queues follow-ups that are due, using the client's followUpTemplate. Called whenever the sender asks for work, so no extra schedule is needed. */
export async function enqueueDueFollowups() {
  if (!FOLLOWUP_SCHEDULE.length) return 0;
  const { creators, clients, outreach, messages } = await db();
  const now = Date.now(), last = FOLLOWUP_SCHEDULE[FOLLOWUP_SCHEDULE.length - 1];
  // window: DMs sent >= first step ago, but not older than the last step + 4 days (so old DMs don't restart a sequence after downtime)
  const due = await creators.find({ status: "DM Sent", dmSentAt: { $lte: new Date(now - FOLLOWUP_SCHEDULE[0] * DAY), $gte: new Date(now - (last + 4) * DAY) }, needsHuman: { $exists: false }, igHandle: { $exists: true } }).limit(500).toArray();
  let n = 0;
  for (const c of due) {
    if (!(await inScope(c))) continue;
    const prev = await outreach.find({ creatorId: c._id, kind: "followup" }).toArray(); // queued, sent or failed all count as used
    if (prev.some((o) => o.status === "queued")) continue; // one waiting already
    // follow-ups a person typed by hand in Instagram count too: logged human messages after the first DM, or the creator's own "Follow-up sent" date
    const manual = await messages.find({ creatorId: c._id, direction: "out", by: "human", at: { $gte: c.dmSentAt } }).toArray();
    const manualN = Math.max(manual.length, c.followUpSentAt && !prev.some((o) => o.status === "sent") ? 1 : 0);
    const times = [...prev.map((o) => o.sentAt ?? o.createdAt), ...manual.map((m) => m.at), ...(c.followUpSentAt ? [c.followUpSentAt] : [])];
    const step = nextStep(c, prev.length + manualN, times.sort((a, b) => +b - +a)[0]);
    if (step < 0) continue;
    if (await conversationActive(c)) continue; // they replied (logged by the replies run) or we are already talking: no nudges
    const first = await outreach.findOne({ creatorId: c._id, channel: "ig", status: "sent", kind: { $ne: "followup" } }, { sort: { sentAt: -1 } });
    const cl = first?.clientId ? await clients.findOne({ _id: first.clientId }) : null;
    const text = stepTexts(cl?.followUpTemplate)[step]; // no text for this step = nothing to send
    if (!cl || !text) continue;
    let message: string;
    try { message = render(text, { name: first?.greet || firstName(c.name), handle: `@${c.igHandle}` }); } catch { continue; }
    await outreach.insertOne({ creatorId: c._id!, clientId: cl._id, channel: "ig", kind: "followup", message, status: "queued", createdAt: new Date() });
    n++;
  }
  return n;
}

/** Our first DM never reached them (Instagram: "can't receive your message"). Undo "sent": the DM is recorded as failed, the creator goes back to New with no DM date,
 *  waiting follow-ups are cancelled, and they are flagged so no later shortlist or follow-up tries again. Safe to call twice. */
export async function markUndelivered(creatorId: ObjectId, reason: string) {
  const { creators, outreach } = await db();
  const why = reason.replace(/\s+/g, " ").trim().slice(0, 200);
  await outreach.findOneAndUpdate({ creatorId, channel: "ig", kind: { $ne: "followup" }, status: "sent" }, { $set: { status: "failed", error: `not delivered: ${why}` } }, { sort: { sentAt: -1 } });
  await outreach.updateMany({ creatorId, kind: "followup", status: "queued" }, { $set: { status: "failed", error: "first DM not delivered" } });
  const c = await creators.findOneAndUpdate({ _id: creatorId, undeliverable: { $exists: false } }, { $set: { undeliverable: { reason: why, at: new Date() } }, $unset: { dmSentAt: "" } });
  if (!c) return; // already handled
  await creators.updateOne({ _id: creatorId, status: "DM Sent" }, { $set: { status: "New" } });
  await notify(`DM not delivered: @${c.igHandle ?? creatorId}`, `${why}. Marked as not contacted; no follow-ups. Reach them another way if you still want them.`);
}

/** True when a conversation is going on with this creator: they wrote to us, we answered them, they moved past "DM Sent", or a human took over. Follow-ups never go to these. */
export async function conversationActive(c: Pick<Creator, "_id" | "status" | "needsHuman" | "undeliverable"> | null) {
  if (!c) return true;
  if (c.status !== "DM Sent" || c.needsHuman || c.undeliverable) return true;
  return !!(await (await db()).messages.findOne({ creatorId: c._id, $or: [{ direction: "in" }, { by: "claude" }] }));
}

/** A creator replied: any follow-up still waiting to go out is pointless now. */
export async function cancelFollowups(creatorId: ObjectId) {
  await (await db()).outreach.updateMany({ creatorId, kind: "followup", status: "queued" }, { $set: { status: "failed", error: "creator replied first" } });
}
