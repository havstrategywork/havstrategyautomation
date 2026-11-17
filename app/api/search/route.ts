import { ObjectId } from "mongodb";
import { unauthorized } from "@/lib/auth";
import { db, type Client } from "@/lib/db";
import { score, scoreParts } from "@/lib/score";
import { tierOf } from "@/lib/fields";
import { capFor, parseMoney } from "@/lib/money";

const list = (v: unknown) => [].concat((v ?? []) as never).map((s) => String(s).trim().toLowerCase()).filter(Boolean);

/**
 * Requirement -> ranked creators. Everything is a soft score except the hard filters below,
 * so a vague requirement still returns the closest matches instead of nothing.
 *
 * body: { clientId?  |  niches[], related[], locations[], minFollowers, maxFollowers, maxRate ("20k INR"), weights },
 *       want = 20, minScore = 40, excludeStatuses = ["Declined"], requireContact?: "ig" | "email",
 *       strongScore = 80, strongCount = 15
 *
 * Hunt rule: if fewer than `strongCount` on-topic creators score ABOVE `strongScore`, `shortfall` > 0 and new creators must be hunted.
 */
export async function POST(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const b = await req.json();
  const { creators, clients } = await db();

  let cl: Client | null = null;
  if (b.clientId && ObjectId.isValid(b.clientId)) cl = await clients.findOne({ _id: new ObjectId(b.clientId) });
  if (b.clientId && !cl) return Response.json({ error: "client not found" }, { status: 404 });
  cl ??= {
    name: "ad-hoc", niches: list(b.niches), related: list(b.related), locations: list(b.locations),
    minFollowers: b.minFollowers ?? 0, maxFollowers: b.maxFollowers ?? 1e9, maxRate: b.maxRate, notes: "",
    weights: { niche: 3, followers: 2, engagement: 2, collab: 1, location: 2, ...b.weights },
  };
  const want = Math.min(Number(b.want) || 20, 100);
  const minScore = b.minScore ?? 40;
  const exclude = new Set<string>(b.excludeStatuses ?? ["Declined"]);

  const pool = (await creators.find().limit(5000).toArray()).filter((c) => {
    if (exclude.has(c.status ?? "New")) return false;
    if (b.requireContact === "ig" && !c.igHandle) return false;
    if (b.requireContact === "email" && !c.email) return false;
    const quote = parseMoney(c.agreedRate ?? c.quotedRate), cap = capFor(cl!, c.followers);
    return !(quote && cap && quote.cur === cap.cur && quote.amt > cap.amt); // budget: only excludes when a rate is known and in the same currency
  });

  // If the requirement names a niche, a creator with zero niche relevance is never a match, however good their other numbers are.
  const gated = cl.niches.length > 0 || (cl.related?.length ?? 0) > 0;
  const ranked = pool.map((c) => ({ c, s: score(c, cl!), onTopic: !gated || scoreParts(c, cl!).niche > 0 })).sort((a, z) => z.s - a.s);
  const row = ({ c, s }: (typeof ranked)[number]) => ({
    id: c._id, score: s, name: c.name, igHandle: c.igHandle, igUrl: c.igHandle && `https://www.instagram.com/${c.igHandle}/`,
    email: c.email, followers: c.followers, tier: tierOf(c.followers), igCategory: c.igCategory, location: c.location,
    niches: c.niches, status: c.status ?? "New", alreadyContacted: !!c.dmSentAt, quotedRate: c.quotedRate,
    fit: Object.fromEntries(Object.entries(scoreParts(c, cl!)).map(([k, v]) => [k, v === null ? null : Math.round(v * 100) / 100])),
  });
  const good = ranked.filter((r) => r.s >= minScore && r.onTopic);
  const results = good.slice(0, want).map(row);
  const strongScore = Number(b.strongScore ?? 80), strongCount = Number(b.strongCount ?? 15);
  const strong = ranked.filter((r) => r.onTopic && r.s > strongScore);
  const shortfall = Math.max(0, strongCount - strong.length); // how many more strong creators are needed

  return Response.json({
    criteria: { niches: cl.niches, related: cl.related, locations: cl.locations, followers: [cl.minFollowers, cl.maxFollowers], maxRate: cl.maxRate, want, minScore },
    poolSize: pool.length,
    returned: results.length,
    reachable: { ig: results.filter((r) => r.igHandle).length, email: results.filter((r) => r.email).length, notYetContacted: results.filter((r) => !r.alreadyContacted).length },
    strong: { count: strong.length, notYetContacted: strong.filter((r) => !r.c.dmSentAt).length, scoreAbove: strongScore, needed: strongCount },
    shortfall, // > 0 means fewer than `needed` creators score above `scoreAbove`: hunt for this many new creators
    results,
    nearMisses: ranked.filter((r) => r.onTopic && r.s < minScore && r.s >= minScore - 15).slice(0, 5).map(row), // on-topic but slightly below the bar: the requirement may be stricter than needed
  });
}
