"use server";
// Dashboard-only actions (a signed-in human). Each one checks the session itself, on top of the proxy.
import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { mine, submitBrief } from "@/lib/briefs";
import type { BriefInput } from "@/lib/brief";
import { upsertClient } from "@/lib/clients";
import { queueFirstDm } from "@/lib/outreach";
import { render } from "@/lib/template";

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

/** The human gate: ticked creators get the DM queued now (the scheduled sender delivers it); unticked ones are rejected. */
export async function approveBrief(fd: FormData) {
  await requireUser();
  const id = idOf(fd);
  const { briefs, clients } = await db();
  const b = await briefs.findOne({ _id: id, status: "awaiting_approval", ...mine() });
  const cl = b?.clientId && (await clients.findOne({ _id: b.clientId }));
  if (!b || !cl) redirect("/campaigns?err=" + encodeURIComponent("That campaign is no longer waiting for approval."));

  const dm = String(fd.get("dmTemplate") ?? "").trim(), fu = String(fd.get("followUp") ?? "").trim();
  try { render(dm || "x", { name: "Sam", handle: "@sam" }); if (fu) render(fu, { name: "Sam", handle: "@sam" }); }
  catch (e) { redirect("/campaigns?err=" + encodeURIComponent(`Message: ${(e as Error).message}. Only {{name}} and {{handle}} can be filled in.`)); }
  if (!dm) redirect("/campaigns?err=" + encodeURIComponent("Write the message to send before approving."));
  await upsertClient({ name: cl.name, dmTemplate: dm, followUpTemplate: fu });

  const picked = new Set(fd.getAll("pick").map(String));
  let queued = 0, skipped = 0;
  const shortlist = [];
  for (const s of b.shortlist) {
    if (s.decision) { shortlist.push(s); continue; } // decided in an earlier round
    if (!picked.has(String(s.creatorId))) { shortlist.push({ ...s, decision: "rejected" as const }); continue; }
    const r = await queueFirstDm({ creatorId: s.creatorId, clientId: b.clientId, useTemplate: true });
    if (r.queued.length) queued++; else skipped++;
    shortlist.push({ ...s, decision: "approved" as const });
  }
  await briefs.updateOne({ _id: id }, { $set: { shortlist, status: "approved", updatedAt: new Date(), note: `Approved: ${queued} DM${queued === 1 ? "" : "s"} queued${skipped ? `, ${skipped} skipped (already contacted or no handle)` : ""}. The scheduled sender delivers them (45 a day).` } });
  revalidatePath("/campaigns");
  revalidatePath("/outreach");
}

/** Back to Cowork for more candidates (it skips everyone already on the shortlist). */
export async function findMore(fd: FormData) {
  await requireUser();
  await (await db()).briefs.updateOne({ _id: idOf(fd), status: { $in: ["approved", "awaiting_approval", "failed"] }, ...mine() }, { $set: { status: "new", note: "More creators requested.", updatedAt: new Date() } });
  revalidatePath("/campaigns");
}

export async function archiveBrief(fd: FormData) {
  await requireUser();
  await (await db()).briefs.updateOne({ _id: idOf(fd), ...mine() }, { $set: { status: "archived", updatedAt: new Date() } });
  revalidatePath("/campaigns");
}
