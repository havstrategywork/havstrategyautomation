// Agreed deals -> Google Sheet (human reviews it, hands it to the client) -> human uploads the client's Yes/No file back -> guidelines email to the creators the client said Yes to.
import { ObjectId } from "mongodb";
import nodemailer from "nodemailer";
import { db, sentToday, type Creator } from "./db";
import { tierOf } from "./fields";
import { addTab, createSheet, mergeDocToPdf } from "./sheet";
import { emailAllowed, handleKey, parseRows, splitSubject } from "./dealrules";
import { sheetIdFromUrl } from "./brief";
import { firstName, render } from "./template";
import { notify } from "./notify";

/** Agreed deals (rate set, ceiling already enforced when it was saved) that are not on a sheet yet, grouped by client id.
 *  The client is the one on the creator's first DM. ponytail: a creator DM'd for two clients goes to the first; split by hand if that's wrong. */
export async function readyDeals() {
  const { creators, outreach } = await db();
  const out = new Map<string, Creator[]>();
  for (const c of await creators.find({ status: "Agreed", agreedRate: { $exists: true }, batchId: { $exists: false } }).limit(500).toArray()) {
    const first = c.dealClientId ? null : await outreach.findOne({ creatorId: c._id, clientId: { $exists: true }, kind: { $ne: "followup" } }, { sort: { createdAt: 1 } });
    const cid = c.dealClientId ?? first?.clientId ?? c.suggestedVia?.[0];
    if (cid) out.set(String(cid), [...(out.get(String(cid)) ?? []), c]);
  }
  return out;
}

/** Same row shape lib/sheet.ts#HEADER expects, Google Sheet or plain .xlsx. */
export const reviewRows = (cs: Creator[]) => cs.map((c) => [
  String(c._id), c.igHandle ? `@${c.igHandle}` : c.name, c.igHandle ? `https://www.instagram.com/${c.igHandle}/` : "",
  c.followers, tierOf(c.followers), c.engagementRate ?? "", c.location ?? "", c.agreedRate ?? "", (c.notes ?? "").slice(0, 200),
]);

/** Builds the review sheet for one client's waiting deals. Nothing is sent anywhere: a human reviews it, then gives it to the client by hand (markShared). */
export async function createBatch(clientId: ObjectId) {
  const { clients, creators, dealBatches } = await db();
  const cl = await clients.findOne({ _id: clientId });
  const ready = (await readyDeals()).get(String(clientId)) ?? [];
  if (!cl || !ready.length) throw new Error("no agreed deals are waiting for this client");
  const rows = reviewRows(ready);
  const sid = cl.sheetUrl ? sheetIdFromUrl(cl.sheetUrl) : null; // the client's own sheet from the brief: add a "Content creators" tab there; else make a fresh sheet
  const sheet = sid ? await addTab(sid, rows) : await createSheet(`${cl.name}: creators to approve (${new Date().toISOString().slice(0, 10)})`, rows);
  const _id = (await dealBatches.insertOne({ clientId, sheetId: sheet.id, tab: sheet.tab, url: sheet.url, creatorIds: ready.map((c) => c._id!), createdAt: new Date() })).insertedId;
  await creators.updateMany({ _id: { $in: ready.map((c) => c._id!) } }, { $set: { batchId: _id, dealClientId: clientId } });
  return { url: sheet.url, count: ready.length };
}

/** Same as createBatch, but for a client with no sheetUrl: skips Google Sheets entirely. The human reviews it as a plain "Download .xlsx"
 *  link instead of "open sheet" (app/campaigns/sheet/[batchId]/route.ts regenerates the file from creatorIds on each download). */
export async function createLocalBatch(clientId: ObjectId) {
  const { creators, dealBatches } = await db();
  const ready = (await readyDeals()).get(String(clientId)) ?? [];
  if (!ready.length) throw new Error("no agreed deals are waiting for this client");
  const _id = (await dealBatches.insertOne({ clientId, creatorIds: ready.map((c) => c._id!), createdAt: new Date() })).insertedId;
  await creators.updateMany({ _id: { $in: ready.map((c) => c._id!) } }, { $set: { batchId: _id, dealClientId: clientId } });
  return { count: ready.length };
}

/** Scheduled: pushes Agreed deals straight into the client's OWN sheet from the brief. Never creates a fresh sheet unattended —
 *  a client with no sheetUrl just keeps waiting here until a human uses the manual "Create sheet" button on Campaigns. */
export async function autoCreateBatches() {
  const { clients } = await db();
  const out: { clientId: string; count?: number; error?: string }[] = [];
  for (const cid of (await readyDeals()).keys()) {
    const cl = await clients.findOne({ _id: new ObjectId(cid) });
    if (!cl?.sheetUrl) continue;
    try { out.push({ clientId: cid, ...(await createBatch(new ObjectId(cid))) }); }
    catch (e) { out.push({ clientId: cid, error: (e as Error).message }); }
  }
  return out;
}

/** A human has reviewed the sheet and handed it to the client. Only bookkeeping: the dashboard shows "with the client since ...". */
export async function markShared(batchId: ObjectId) {
  const r = await (await db()).dealBatches.updateOne({ _id: batchId, sharedAt: { $exists: false } }, { $set: { sharedAt: new Date() } });
  if (!r.matchedCount) throw new Error("already marked as given to the client");
}

/** A human uploads the sheet the client sent back (CSV or .xlsx, already split into rows). Saves each Yes/No + note onto the creators of THAT batch (matched by id, else by handle).
 *  Rows whose guidelines already went out are left alone. Uploading again just updates answers, so a corrected file is fine. */
export async function applyAnswers(batchId: ObjectId, rows: string[][]) {
  const { creators, dealBatches, clients } = await db();
  const b = await dealBatches.findOne({ _id: batchId });
  if (!b) throw new Error("sheet not found");
  const people = await creators.find({ _id: { $in: b.creatorIds } }).toArray();
  const byId = new Map(people.map((c) => [String(c._id), c])), byHandle = new Map(people.flatMap((c) => (c.igHandle ? [[handleKey(c.igHandle), c] as const] : [])));
  const res = { yes: 0, no: 0, unanswered: 0, unmatched: 0, locked: 0 };
  for (const a of parseRows(rows)) {
    const c = (a.id && byId.get(a.id)) || (a.handle && byHandle.get(a.handle)) || null;
    if (!c) { res.unmatched++; continue; }
    if (!a.decision) { res.unanswered++; continue; }
    if (c.guidelinesSentAt) { res.locked++; continue; } // already emailed: the answer can't change anymore
    if (c.clientDecision !== a.decision || c.clientNote !== a.note) await creators.updateOne({ _id: c._id, guidelinesSentAt: { $exists: false } }, { $set: { clientDecision: a.decision, clientNote: a.note, decidedAt: new Date() } });
    res[a.decision]++;
  }
  if (res.yes + res.no + res.locked === 0) throw new Error(`no Yes/No answers found in that file${res.unmatched ? ` (${res.unmatched} rows didn't match this sheet's creators)` : ""}`);
  await dealBatches.updateOne({ _id: batchId }, { $set: { answeredAt: new Date() } });
  await notify(`Client answers uploaded: ${(await clients.findOne({ _id: b.clientId }))?.name ?? "client"}`, `${res.yes} yes, ${res.no} no. The guidelines email goes to the Yes ones on the next run, or send it from Campaigns.`);
  return res;
}

/** The hourly job: guidelines for every client that has approved creators still waiting. One client failing (e.g. no saved email yet) doesn't stop the others. */
export async function sendAllGuidelines() {
  const { creators } = await db();
  const out: ({ clientId: string } & ({ error: string } | Awaited<ReturnType<typeof sendGuidelines>>))[] = [];
  for (const id of (await creators.distinct("dealClientId", { clientDecision: "yes", guidelinesSentAt: { $exists: false } })).filter((i): i is ObjectId => !!i)) {
    try { out.push({ clientId: String(id), ...(await sendGuidelines(id)) }); } catch (e) { out.push({ clientId: String(id), error: (e as Error).message }); }
  }
  return out;
}

/** Emails the client's guidelines to every creator they said Yes to. Idempotent: a creator is claimed (guidelinesSentAt) before sending, so a double click can't mail twice. */
export async function sendGuidelines(clientId: ObjectId) {
  const { clients, creators, outreach } = await db();
  const cl = await clients.findOne({ _id: clientId });
  if (!cl?.guidelinesTemplate) throw new Error("save the guidelines email for this client first");
  render(cl.guidelinesTemplate, { name: "x", handle: "x", rate: "x", brand: "x" }); // fail early on a bad placeholder
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD are not set");
  const mail = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  const cap = Number(process.env.EMAIL_DAILY_CAP ?? 100);
  const res = { sent: 0, noEmail: [] as string[], blocked: 0, failed: 0, capped: false };
  for (const c of await creators.find({ dealClientId: clientId, clientDecision: "yes", guidelinesSentAt: { $exists: false } }).toArray()) {
    if (!c.email) { res.noEmail.push(c.igHandle ? `@${c.igHandle}` : c.name); continue; }
    if (!emailAllowed(c.email, process.env.EMAIL_ALLOWLIST)) { res.blocked++; continue; }
    if ((await sentToday("email")) >= cap) { res.capped = true; break; }
    if (!(await creators.findOneAndUpdate({ _id: c._id, guidelinesSentAt: { $exists: false } }, { $set: { guidelinesSentAt: new Date() } }))) continue; // someone else just sent it
    const vars = { name: firstName(c.name), handle: c.igHandle ?? "", rate: c.agreedRate ?? "", brand: cl.name };
    const { subject, body } = splitSubject(render(cl.guidelinesTemplate, vars));
    const attachments: { filename: string; path?: string; content?: Buffer }[] = [];
    if (cl.guidelinesFileUrl) attachments.push({ filename: cl.guidelinesFileName || "Brand guidelines.pdf", path: cl.guidelinesFileUrl });
    if (cl.termsDocId) {
      try { attachments.push({ filename: "Terms.pdf", content: await mergeDocToPdf(cl.termsDocId, vars) }); }
      catch (e) { await outreach.insertOne({ creatorId: c._id!, clientId, channel: "email", kind: "terms", message: "", status: "failed", error: `terms doc: ${(e as Error).message}`.slice(0, 200), createdAt: new Date() }); }
    }
    try {
      await mail.sendMail({ from: user, to: c.email, subject, text: body, attachments });
      await outreach.insertOne({ creatorId: c._id!, clientId, channel: "email", kind: "guidelines", subject, message: body, status: "sent", createdAt: new Date(), sentAt: new Date() });
      res.sent++;
    } catch (e) {
      await creators.updateOne({ _id: c._id }, { $unset: { guidelinesSentAt: "" } }); // release the claim so it can be retried
      await outreach.insertOne({ creatorId: c._id!, clientId, channel: "email", kind: "guidelines", subject, message: body, status: "failed", error: (e as Error).message.slice(0, 200), createdAt: new Date() });
      res.failed++;
    }
  }
  if (res.sent) await notify(`Guidelines emailed: ${cl.name}`, `${res.sent} sent${res.noEmail.length ? `, ${res.noEmail.length} have no email` : ""}.`);
  return res;
}
