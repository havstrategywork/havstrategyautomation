import { unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { TIERS } from "@/lib/fields";
import { cleanMoney } from "@/lib/money";

const list = (v: unknown) => [].concat((v ?? []) as never).map((s) => String(s).trim().toLowerCase()).filter(Boolean);

export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  return Response.json(await (await db()).clients.find().toArray());
}

// Upserts by name (case-insensitive), changing only the fields you send. Safe to call for every new requirement.
export async function POST(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const b = await req.json();
  if (!b.name) return Response.json({ error: "name required" }, { status: 400 });
  const { clients } = await db();
  const set: Record<string, unknown> = {}, tr: Record<string, string> = {};
  for (const k of ["niches", "related", "locations"]) if (b[k] != null) set[k] = list(b[k]);
  for (const k of ["minFollowers", "maxFollowers"]) if (b[k] != null && !isNaN(Number(b[k]))) set[k] = Number(b[k]);
  try {
    if (b.maxRate != null && b.maxRate !== "") set.maxRate = cleanMoney(b.maxRate, "maxRate");
    for (const [tier, v] of Object.entries(b.tierRates ?? {})) { // { Nano: "10k INR", Micro: "20k INR" }: overrides maxRate for that tier
      const t = TIERS.find((x) => x.toLowerCase() === tier.toLowerCase());
      if (!t) throw new Error(`tierRates: unknown tier "${tier}" (use ${TIERS.join(", ")})`);
      tr[t] = cleanMoney(v, `tierRates.${t}`);
    }
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  if (b.notes != null) set.notes = String(b.notes);
  for (const k of ["offer", "dmTemplate", "emailSubject"]) if (b[k] != null) set[k] = String(b[k]);
  for (const [k, v] of Object.entries(b.weights ?? {})) set[`weights.${k}`] = Number(v);

  const existing = await clients.findOne({ name: new RegExp(`^${String(b.name).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
  if (existing) {
    for (const [t, v] of Object.entries(tr)) set[`tierRates.${t}`] = v; // dotted keys merge into the stored map
    return Response.json(await clients.findOneAndUpdate({ _id: existing._id }, { $set: set }, { returnDocument: "after" }));
  }
  const doc = {
    niches: [], related: [], locations: [], minFollowers: 0, maxFollowers: 1e9, notes: "", ...set, name: String(b.name).trim(),
    weights: { niche: 3, followers: 2, engagement: 2, collab: 1, location: 2, ...b.weights },
    ...(Object.keys(tr).length && { tierRates: tr }),
  };
  for (const k of Object.keys(doc)) if (k.startsWith("weights.")) delete (doc as Record<string, unknown>)[k];
  return Response.json({ ...doc, _id: (await clients.insertOne(doc)).insertedId });
}
