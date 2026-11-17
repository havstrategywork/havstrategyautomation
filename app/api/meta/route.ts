import { unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { tierOf } from "@/lib/fields";

const count = (xs: (string | undefined | null)[]) => {
  const m = new Map<string, number>();
  for (const x of xs) if (x?.trim()) m.set(x.trim().toLowerCase(), (m.get(x.trim().toLowerCase()) ?? 0) + 1);
  return Object.fromEntries([...m].sort((a, b) => b[1] - a[1]));
};

/** The database's actual vocabulary. Read this BEFORE turning a vague requirement into search terms. */
export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const { creators, clients } = await db();
  const all = await creators.find().limit(5000).toArray();
  return Response.json({
    total: all.length,
    withIg: all.filter((c) => c.igHandle).length,
    withEmail: all.filter((c) => c.email).length,
    niches: count(all.flatMap((c) => c.niches)),
    igCategories: count(all.map((c) => c.igCategory)),
    locations: count(all.map((c) => c.location)),
    tiers: count(all.map((c) => tierOf(c.followers))),
    statuses: count(all.map((c) => c.status ?? "New")),
    clients: (await clients.find().toArray()).map((c) => ({ id: c._id, name: c.name, niches: c.niches })),
  });
}
