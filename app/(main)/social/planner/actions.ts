"use server";
// Everything the planner changes in Buffer. Each action re-checks the role (the proxy already blocks the page, but a server action must never trust that alone)
// and that the channel is one an organization of ours has linked, so a forged request can't touch other channels the API key happens to reach.
import { db } from "@/lib/db";
import { BufferError, checkNewPost, createPostBody, deleteBody, dayIn, getPost, istToUtc, moveBody, mutate, rescheduleBody, type NewPost } from "@/lib/buffer";
import { canView } from "@/lib/roles";
import { currentUser } from "@/lib/session";

export type Result = { ok: true; message: string } | { ok: false; message: string };
const fail = (e: unknown): Result => { console.error("[planner]", e); return { ok: false, message: e instanceof BufferError ? e.message : "Something went wrong talking to Buffer." }; };

async function allowed() {
  const me = await currentUser();
  return !!me && canView(me.role, "/social/planner");
}
/** The linked channel (or null) for a Buffer channel id. */
async function linked(channelId: string) {
  const o = await (await db()).orgs.findOne({ "buffer.channelId": channelId });
  return o?.buffer?.find((b) => b.channelId === channelId) ?? null;
}
/** The post, or the reason it can not be changed. */
async function guardPost(id: string) {
  if (!(await allowed())) return "Not allowed.";
  const p = await getPost(id).catch(() => null);
  if (!p || !(await linked(p.channelId))) return "That post is not on a channel linked here.";
  return p;
}

export async function createPost(f: FormData): Promise<Result> {
  if (!(await allowed())) return { ok: false, message: "Not allowed." };
  const channelId = String(f.get("channel") ?? ""), l = await linked(channelId);
  if (!l) return { ok: false, message: "Pick one of the linked channels." };
  const mode = (["schedule", "queue", "draft"] as const).find((m) => m === f.get("mode")) ?? "schedule";
  const date = String(f.get("date") ?? ""), time = String(f.get("time") ?? "") || "10:00";
  const dueAt = mode === "queue" ? undefined : istToUtc(date, time) ?? undefined; // a draft keeps its date if one was given
  const post: NewPost = { channelId, service: l.service, text: String(f.get("text") ?? "").trim(), mode, dueAt, mediaUrl: String(f.get("media") ?? "").trim() || undefined, mediaKind: (["image", "video"] as const).find((k) => k === f.get("mediaKind")), igType: (["post", "reel", "story"] as const).find((t) => t === f.get("igType")), notify: f.get("notify") === "on" };
  const bad = checkNewPost(post);
  if (bad) { console.error("[planner] refused:", bad); return { ok: false, message: bad }; }
  try { await mutate(createPostBody(post)); } catch (e) { return fail(e); }
  return { ok: true, message: mode === "draft" ? "Saved as a draft." : mode === "queue" ? "Added to the Buffer queue." : "Scheduled." };
}

/** Tomorrow 10:00 India time: where a draft with no date lands when it is dragged to Scheduled. */
const tomorrowTen = () => istToUtc(new Date(Date.now() + 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }), "10:00")!;

export async function movePost(id: string, to: "draft" | "scheduled"): Promise<Result> {
  const g = await guardPost(id);
  if (typeof g === "string") return { ok: false, message: g };
  if (g.status === to) return { ok: true, message: "Already there." };
  if (!(["draft", "scheduled"] as string[]).includes(g.status)) return { ok: false, message: "Only drafts and scheduled posts can be moved." };
  const dueAt = g.dueAt && Date.parse(g.dueAt) > Date.now() + 60_000 ? g.dueAt : tomorrowTen();
  try { await mutate(moveBody(id, to, dueAt)); } catch (e) { return fail(e); }
  return { ok: true, message: to === "draft" ? "Moved back to drafts." : `Scheduled for ${dayIn(dueAt)}.` };
}

export async function reschedulePost(id: string, date: string, time: string): Promise<Result> {
  const g = await guardPost(id), dueAt = istToUtc(date, time);
  if (typeof g === "string") return { ok: false, message: g };
  if (!dueAt || Date.parse(dueAt) < Date.now() + 60_000) return { ok: false, message: "Pick a date and time in the future." };
  try { await mutate(rescheduleBody(id, dueAt)); } catch (e) { return fail(e); }
  return { ok: true, message: "Rescheduled." };
}

export async function removePost(id: string): Promise<Result> {
  const g = await guardPost(id);
  if (typeof g === "string") return { ok: false, message: g };
  try { await mutate(deleteBody(id)); } catch (e) { return fail(e); }
  return { ok: true, message: "Deleted from Buffer (a post already on Instagram stays there)." };
}
