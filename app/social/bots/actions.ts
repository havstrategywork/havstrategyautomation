"use server";
import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { parseFlow, starterFlow, type Flow } from "@/lib/botflow";
import { currentUser } from "@/lib/session";

// Chat-bot actions: the social team builds and switches flows; admins can too. (Connecting Instagram accounts stays admin-only, on the Organizations page.)
// Every action re-checks the role itself: the proxy already protects the pages, but a server action must never rely on that alone.
async function team() {
  const me = await currentUser();
  if (me?.role !== "admin" && me?.role !== "social") redirect("/login");
}
const back = (org: string, msg: string) => redirect(`/social/bots?${new URLSearchParams({ org, m: msg })}`);
const oid = (v: FormDataEntryValue | null) => { const s = String(v ?? ""); return ObjectId.isValid(s) ? new ObjectId(s) : null; };

export async function createFlow(f: FormData) {
  await team();
  const { botConnections, botFlows } = await db(), conn = await botConnections.findOne({ _id: oid(f.get("conn")) ?? new ObjectId() });
  if (!conn) return redirect("/social/bots");
  const name = String(f.get("name") ?? "").trim().slice(0, 80) || "New flow", now = new Date();
  const { insertedId } = await botFlows.insertOne({ orgId: conn.orgId, igId: conn.igId, name, enabled: false, ...starterFlow(), createdAt: now, updatedAt: now }); // starts switched off
  redirect(`/social/bots/${insertedId}`);
}

export async function toggleFlow(f: FormData) {
  await team();
  const { botFlows } = await db(), flow = await botFlows.findOne({ _id: oid(f.get("id")) ?? new ObjectId() });
  if (!flow) return redirect("/social/bots");
  await botFlows.updateOne({ _id: flow._id }, { $set: { enabled: !flow.enabled, updatedAt: new Date() } });
  revalidatePath("/social/bots"); revalidatePath(`/social/bots/${flow._id}`);
  if (f.get("from") === "editor") return redirect(`/social/bots/${flow._id}`);
  back(String(flow.orgId), `${flow.name} is now ${flow.enabled ? "off" : "on"}.`);
}

export async function deleteFlow(f: FormData) {
  await team();
  const { botFlows } = await db(), flow = await botFlows.findOne({ _id: oid(f.get("id")) ?? new ObjectId() });
  if (!flow) return redirect("/social/bots");
  await botFlows.deleteOne({ _id: flow._id });
  revalidatePath("/social/bots"); back(String(flow.orgId), `Deleted ${flow.name}.`);
}

export async function renameFlow(f: FormData) {
  await team();
  const name = String(f.get("name") ?? "").trim().slice(0, 80), id = oid(f.get("id"));
  if (id && name) await (await db()).botFlows.updateOne({ _id: id }, { $set: { name, updatedAt: new Date() } });
  redirect(`/social/bots/${id}`);
}

/** Called by the editor's Save button. Returns the problems instead of throwing, so the editor can list them. */
export async function saveFlow(id: string, raw: unknown): Promise<{ ok: boolean; errors: string[] }> {
  await team();
  if (!ObjectId.isValid(id)) return { ok: false, errors: ["Unknown flow."] };
  const { flow, errors } = parseFlow(raw);
  if (errors.length) return { ok: false, errors };
  const r = await (await db()).botFlows.updateOne({ _id: new ObjectId(id) }, { $set: { nodes: flow.nodes, edges: flow.edges, updatedAt: new Date() } });
  return r.matchedCount ? { ok: true, errors: [] } : { ok: false, errors: ["This flow no longer exists."] };
}
export type SaveResult = Awaited<ReturnType<typeof saveFlow>>;
export type { Flow };
