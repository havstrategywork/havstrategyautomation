// Client upsert by name (case-insensitive), changing only the fields given. Used by POST /api/clients and by brief submission.
import { db } from "./db";
import { TIERS } from "./fields";
import { cleanMoney } from "./money";

const list = (v: unknown) => [].concat((v ?? []) as never).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Throws Error with a readable message on bad input (unknown tier, money without currency...). */
export async function upsertClient(b: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!b.name || !String(b.name).trim()) throw new Error("name required");
  const { clients } = await db();
  const set: Record<string, unknown> = {}, tr: Record<string, string> = {};
  for (const k of ["niches", "related", "locations"]) if (b[k] != null) set[k] = list(b[k]);
  for (const k of ["minFollowers", "maxFollowers"]) if (b[k] != null && !isNaN(Number(b[k]))) set[k] = Number(b[k]);
  if (b.maxRate != null && b.maxRate !== "") set.maxRate = cleanMoney(b.maxRate, "maxRate");
  for (const [tier, v] of Object.entries(b.tierRates ?? {})) { // { Nano: "10k INR", Micro: "20k INR" }: overrides maxRate for that tier
    const t = TIERS.find((x) => x.toLowerCase() === tier.toLowerCase());
    if (!t) throw new Error(`tierRates: unknown tier "${tier}" (use ${TIERS.join(", ")})`);
    tr[t] = cleanMoney(v, `tierRates.${t}`);
  }
  if (b.notes != null) set.notes = String(b.notes);
  for (const k of ["offer", "dmTemplate", "followUpTemplate", "guidelinesTemplate", "sheetUrl"]) if (b[k] != null) set[k] = String(b[k]);
  for (const [k, v] of Object.entries(b.weights ?? {})) set[`weights.${k}`] = Number(v);

  const existing = await clients.findOne({ name: new RegExp(`^${esc(String(b.name).trim())}$`, "i") });
  if (existing) {
    for (const [t, v] of Object.entries(tr)) set[`tierRates.${t}`] = v; // dotted keys merge into the stored map
    return (await clients.findOneAndUpdate({ _id: existing._id }, { $set: set }, { returnDocument: "after" }))!;
  }
  const doc = {
    niches: [], related: [], locations: [], minFollowers: 0, maxFollowers: 1e9, notes: "", ...set, name: String(b.name).trim(),
    weights: { niche: 3, followers: 2, engagement: 2, collab: 1, location: 2, ...b.weights },
    ...(Object.keys(tr).length && { tierRates: tr }),
  };
  for (const k of Object.keys(doc)) if (k.startsWith("weights.")) delete (doc as Record<string, unknown>)[k];
  return { ...doc, _id: (await clients.insertOne(doc as never)).insertedId };
}
