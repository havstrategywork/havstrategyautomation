import { ObjectId } from "mongodb";
import { db, type Creator } from "./db";
import { score } from "./score";
import { STATUSES, tierOf } from "./fields";
import { cleanMoney } from "./money";

export const handleOf = (s?: string) =>
  s?.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").split(/[/?#]/)[0].toLowerCase() || undefined;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rx = (s: string, exact = false) => new RegExp(exact ? `^${esc(s)}$` : esc(s), "i");

export async function listCreators(o: { clientId?: string; niche?: string; q?: string; minScore?: number; status?: string; tier?: string; page?: number; limit?: number }) {
  const { creators, clients } = await db();
  const filter: Record<string, unknown> = {};
  if (o.niche) filter.niches = rx(o.niche, true);
  if (o.status) filter.status = o.status === "New" ? { $in: ["New", null] } : o.status;
  if (o.q) filter.$or = ["name", "igHandle", "notes"].map((k) => ({ [k]: rx(o.q!) }));
  const rows = (await creators.find(filter).limit(1000).toArray()).filter((c) => !o.tier || tierOf(c.followers) === o.tier);
  const client = o.clientId && ObjectId.isValid(o.clientId) ? await clients.findOne({ _id: new ObjectId(o.clientId) }) : null;
  const out = rows.map((c) => ({ ...c, score: client ? score(c, client) : null }));
  const sorted = client ? out.filter((c) => c.score! >= (o.minScore ?? 0)).sort((a, b) => b.score! - a.score!) : out;
  if (o.page && o.limit) {
    const start = (o.page - 1) * o.limit;
    return sorted.slice(start, start + o.limit);
  }
  return sorted;
}

const STR = ["name", "phone", "contactSource", "igCategory", "location", "notes", "response", "outreachNotes"];
const NUM = ["followers", "engagementRate"];
const MONEY = ["quotedRate", "agreedRate"]; // text with currency, e.g. "10k INR"
const DATE = ["dmSentAt", "lastChecked", "followUpSentAt"];

/** Whitelists + normalises an untrusted creator payload (API, CSV, forms). Throws on a bad status. */
export function clean(p: Record<string, any>): Partial<Creator> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const o: Record<string, unknown> = {};
  for (const k of STR) if (p[k] != null && p[k] !== "") o[k] = String(p[k]).trim();
  for (const k of NUM) if (p[k] != null && p[k] !== "" && !isNaN(Number(p[k]))) o[k] = Number(p[k]);
  for (const k of MONEY) if (p[k] != null && p[k] !== "") o[k] = cleanMoney(p[k], k);
  for (const k of DATE) if (p[k]) { const d = new Date(p[k]); if (!isNaN(+d)) o[k] = d; }
  const igHandle = handleOf(p.igHandle ?? p.igUrl);
  if (igHandle) o.igHandle = igHandle;
  const email = String(p.email ?? "").trim().toLowerCase();
  if (email) o.email = email;
  if (p.niches) o.niches = [].concat(p.niches).map((n) => String(n).trim().toLowerCase()).filter(Boolean);
  if (p.platforms) o.platforms = p.platforms;
  if (p.collab) o.collab = p.collab;
  if (p.suggestedVia) o.suggestedVia = [].concat(p.suggestedVia).filter((i) => ObjectId.isValid(i)).map((i) => new ObjectId(i));
  if (p.status) {
    if (!(STATUSES as readonly string[]).includes(p.status)) throw new Error(`status must be one of: ${STATUSES.join(", ")}`);
    o.status = p.status;
  }
  return o as Partial<Creator>;
}

/** Upserts one creator by igHandle/email. Re-pushing is safe; only provided fields change. */
export async function upsertCreator(p: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { creators } = await db();
  const set = clean(p);
  if (!set.igHandle && !set.email) throw new Error("need igHandle or email");
  set.lastChecked ??= new Date(); // any push counts as a check
  const defaults: Record<string, unknown> = {
    name: set.igHandle ?? set.email, niches: [], followers: 0, collab: { count: 0, rating: 0, notes: "" },
    notes: "", source: p.source ?? "manual", createdAt: new Date(), status: "New", suggestedVia: [],
  };
  for (const k of Object.keys(set)) delete defaults[k];
  const r = await creators.findOneAndUpdate(
    { $or: [...(set.igHandle ? [{ igHandle: set.igHandle }] : []), ...(set.email ? [{ email: set.email }] : [])] },
    { $set: set, $setOnInsert: defaults },
    { upsert: true, returnDocument: "after" },
  );
  return r!;
}
