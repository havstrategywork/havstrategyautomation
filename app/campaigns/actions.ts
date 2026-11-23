"use server";
// Dashboard-only actions (a signed-in human). Each one checks the session itself, on top of the proxy.
import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { editBrief, queueShortlist, submitBrief } from "@/lib/briefs";
import { docIdFromUrl, type BriefInput } from "@/lib/brief";
import { upsertClient } from "@/lib/clients";
import { render } from "@/lib/template";
import { applyAnswers, createBatch, createLocalBatch, deadlineVars, markShared, sendFollowEmail, sendGuidelines, type FollowEmail } from "@/lib/deals";
import { daysLabel, daysLeft } from "@/lib/dealrules";
import { csvRows } from "@/lib/dealrules";
import { xlsxRows } from "@/lib/xlsx";

async function requireUser() {
  if (!(await currentUser())) redirect("/login");
}
const idOf = (fd: FormData) => {
  const id = String(fd.get("id") ?? "");
  if (!ObjectId.isValid(id)) throw new Error("bad id");
  return new ObjectId(id);
};

/** From the chat: save the client + brief. The scheduled Cowork "briefs" run takes it from here. */
export async function submitBriefAction(b: BriefInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireUser();
  try {
    const id = await submitBrief(b);
    revalidatePath("/campaigns");
    return { ok: true, id: String(id) };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Same shape as submitBriefAction, but for an existing campaign (BriefChat reuses itself in "edit" mode). */
export async function editBriefAction(id: string, b: BriefInput): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  try {
    if (!ObjectId.isValid(id)) throw new Error("bad id");
    await editBrief(new ObjectId(id), b);
    revalidatePath("/campaigns");
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** The human gate: ticked creators get the DM queued now (the scheduled sender delivers it); unticked ones are rejected. */
export async function approveBrief(fd: FormData) {
  await requireUser();
  const id = idOf(fd);
  const { briefs, clients } = await db();
  const b = await briefs.findOne({ _id: id, status: "awaiting_approval" });
  const cl = b?.clientId && (await clients.findOne({ _id: b.clientId }));
  if (!b || !cl) redirect("/campaigns?err=" + encodeURIComponent("That campaign is no longer waiting for approval."));

  const dm = String(fd.get("dmTemplate") ?? "").trim(), fu = String(fd.get("followUp") ?? "").trim();
  try { render(dm || "x", { name: "Sam", handle: "@sam" }); if (fu) render(fu, { name: "Sam", handle: "@sam" }); }
  catch (e) { redirect("/campaigns?err=" + encodeURIComponent(`Message: ${(e as Error).message}. Only {{name}} and {{handle}} can be filled in.`)); }
  if (!dm) redirect("/campaigns?err=" + encodeURIComponent("Write the message to send before approving."));
  await upsertClient({ name: cl.name, dmTemplate: dm, followUpTemplate: fu });

  const picked = new Set(fd.getAll("pick").map(String));
  const { queued, skipped, shortlist } = await queueShortlist(b, (s) => picked.has(String(s.creatorId)));
  await briefs.updateOne({ _id: id }, { $set: { shortlist, status: "approved", updatedAt: new Date(), note: `Approved: ${queued} DM${queued === 1 ? "" : "s"} queued${skipped ? `, ${skipped} skipped (already contacted or no handle)` : ""}. The scheduled sender delivers them (75 a day).` } });
  revalidatePath("/campaigns");
  revalidatePath("/outreach");
}

// Client review of agreed deals (lib/deals.ts). Each runs, then comes back to /campaigns with a message.
async function back(run: () => Promise<string>): Promise<never> {
  let q = "ok=";
  try { q += encodeURIComponent(await run()); } catch (e) { q = "err=" + encodeURIComponent((e as Error).message); }
  revalidatePath("/campaigns");
  redirect(`/campaigns?${q}`);
}

export async function createSheetAction(fd: FormData) {
  await requireUser();
  await back(async () => {
    const r = await createBatch(idOf(fd));
    return `Sheet created for ${r.count} creator${r.count === 1 ? "" : "s"}. Review it, give it to the client yourself, then mark it as given.`;
  });
}

/** For a client with no sheetUrl: skips Google Sheets, the batch shows up below with a "Download .xlsx" link instead of "open sheet". */
export async function createLocalBatchAction(fd: FormData) {
  await requireUser();
  await back(async () => {
    const r = await createLocalBatch(idOf(fd));
    return `Ready for ${r.count} creator${r.count === 1 ? "" : "s"}: download the .xlsx below, review it, give it to the client yourself, then mark it as given.`;
  });
}

/** The human reviewed the sheet and handed it to the client (outside the app). */
export async function markSharedAction(fd: FormData) {
  await requireUser();
  await back(async () => { await markShared(idOf(fd)); return "Marked as given to the client."; });
}

/** The human uploads the sheet the client sent back (CSV). This is the only way the client's Yes/No gets into the app. */
export async function uploadAnswersAction(fd: FormData) {
  await requireUser();
  await back(async () => {
    const f = fd.get("file");
    if (!(f instanceof File) || !f.size) throw new Error("choose the client's file first");
    if (f.size > 1e6) throw new Error("that file is too big for a creator sheet (max 1 MB)");
    const xlsx = /\.xlsx$/i.test(f.name);
    if (!xlsx && !/\.(csv|txt)$/i.test(f.name)) throw new Error("upload the client's file as .xlsx or .csv (older .xls: open it and Save as .xlsx)");
    const rows = xlsx ? await xlsxRows(Buffer.from(await f.arrayBuffer())) : csvRows(await f.text());
    const r = await applyAnswers(idOf(fd), rows);
    return `Saved ${r.yes} yes and ${r.no} no.${r.unanswered ? ` ${r.unanswered} still unanswered.` : ""}${r.unmatched ? ` ${r.unmatched} row(s) didn't match a creator on this sheet and were ignored.` : ""}${r.locked ? ` ${r.locked} already had guidelines sent, left as is.` : ""}`;
  });
}

export async function saveGuidelinesAction(fd: FormData) {
  await requireUser();
  await back(async () => {
    const cl = await (await db()).clients.findOne({ _id: idOf(fd) });
    if (!cl) throw new Error("client not found");
    const t = String(fd.get("guidelines") ?? "").trim();
    try { render(t || "x", { name: "Sam", handle: "sam", rate: "10k INR", brand: cl.name }); } catch (e) { throw new Error(`${(e as Error).message}. Only {{name}}, {{handle}}, {{rate}} and {{brand}} can be filled in.`); }
    const termsDocUrl = String(fd.get("termsDocUrl") ?? "").trim();
    const termsDocId = termsDocUrl ? docIdFromUrl(termsDocUrl) : null;
    if (termsDocUrl && !termsDocId) throw new Error("the terms doc link must be a Google Docs link (docs.google.com/document/d/...)");
    await upsertClient({ name: cl.name, guidelinesTemplate: t, termsDocId: termsDocId ?? "" });
    return "Guidelines saved.";
  });
}

export async function sendGuidelinesAction(fd: FormData) {
  await requireUser();
  await back(async () => {
    const r = await sendGuidelines(idOf(fd));
    return `Guidelines emailed to ${r.sent}.${r.noEmail.length ? ` No email on file for ${r.noEmail.join(", ")}: reach them on Instagram.` : ""}${r.blocked ? ` ${r.blocked} held back by EMAIL_ALLOWLIST (test mode).` : ""}${r.failed ? ` ${r.failed} failed (see Outreach).` : ""}${r.capped ? " Stopped at the daily email cap." : ""}`;
  });
}

/** Saves the script reminder + deadline emails and the content deadline date (one form, under the guidelines email). */
export async function saveFollowEmailsAction(fd: FormData) {
  await requireUser();
  await back(async () => {
    const cl = await (await db()).clients.findOne({ _id: idOf(fd) });
    if (!cl) throw new Error("client not found");
    const script = String(fd.get("script") ?? "").trim(), deadline = String(fd.get("deadlineEmail") ?? "").trim(), date = String(fd.get("contentDeadline") ?? "").trim();
    if (date && daysLeft(date) === null) throw new Error("the content deadline must be a date");
    const vars = { name: "Sam", handle: "sam", rate: "10k INR", ...deadlineVars(date || "2030-01-01") };
    for (const [label, t] of [["Script reminder", script], ["Deadline email", deadline]] as const) {
      try { render(t || "x", vars); } catch (e) { throw new Error(`${label}: ${(e as Error).message}. Only {{name}}, {{handle}}, {{rate}}, {{deadline}} and {{days}} can be filled in.`); }
    }
    await upsertClient({ name: cl.name, scriptReminderTemplate: script, deadlineTemplate: deadline, contentDeadline: date });
    return "Script reminder and deadline email saved.";
  });
}

async function sendFollow(fd: FormData, kind: FollowEmail) {
  await requireUser();
  await back(async () => {
    const id = idOf(fd);
    const r = await sendFollowEmail(id, kind);
    const cl = kind === "deadline" ? await (await db()).clients.findOne({ _id: id }) : null;
    const d = cl ? daysLeft(cl.contentDeadline) : null;
    const what = kind === "script" ? "Script reminder" : `Deadline email${d !== null ? ` (${daysLabel(d)})` : ""}`;
    return `${what} sent to ${r.sent}.${r.noEmail.length ? ` No email on file for ${r.noEmail.join(", ")}: reach them on Instagram.` : ""}${r.blocked ? ` ${r.blocked} held back by EMAIL_ALLOWLIST (test mode).` : ""}${r.failed ? ` ${r.failed} failed (see Outreach).` : ""}${r.capped ? " Stopped at the daily email cap." : ""}`;
  });
}
export async function sendScriptReminderAction(fd: FormData) { await sendFollow(fd, "script"); }
export async function sendDeadlineAction(fd: FormData) { await sendFollow(fd, "deadline"); }

/** Back to Cowork for more candidates (it skips everyone already on the shortlist). */
export async function findMore(fd: FormData) {
  await requireUser();
  await (await db()).briefs.updateOne({ _id: idOf(fd), status: { $in: ["approved", "awaiting_approval", "failed"] } }, { $set: { status: "new", note: "More creators requested.", updatedAt: new Date() } });
  revalidatePath("/campaigns");
}

export async function archiveBrief(fd: FormData) {
  await requireUser();
  await (await db()).briefs.updateOne({ _id: idOf(fd) }, { $set: { status: "archived", updatedAt: new Date() } });
  revalidatePath("/campaigns");
}

/** Permanent. Only an already-archived campaign can be deleted, so there's always an undo-able step first. Doesn't touch the creators,
 *  outreach or messages it produced -- those stay in the system on their own. */
export async function deleteBrief(fd: FormData) {
  await requireUser();
  await back(async () => {
    const r = await (await db()).briefs.deleteOne({ _id: idOf(fd), status: "archived" });
    if (!r.deletedCount) throw new Error("archive the campaign first, then delete it");
    return "Campaign deleted.";
  });
}
