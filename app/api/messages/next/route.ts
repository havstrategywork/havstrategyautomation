import { unauthorized } from "@/lib/auth";
import { db, igAllowed } from "@/lib/db";
import { isPaused } from "@/lib/control";
import { PRIORITIES } from "@/lib/priority";
import { creatorRank, priorityRanks } from "@/lib/threads";

// Queued replies for Claude-in-Chrome to type into the existing conversation (not a new DM).
export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const paused = await isPaused();
  if (paused) return Response.json({ paused: paused.reason, items: [] });
  const { messages, creators } = await db();
  const [queued, ranks] = await Promise.all([messages.find({ direction: "out", status: "queued" }).sort({ at: 1 }).limit(100).toArray(), priorityRanks()]);
  const people = new Map((queued.length ? await creators.find({ _id: { $in: queued.map((m) => m.creatorId) } }).toArray() : []).map((c) => [String(c._id), c]));
  // each queued reply is checked on its own (the "newer message" test ignores status), so the checks run side by side; the order is kept
  const items = (await Promise.all(queued.map(async (m) => {
    const newer = await messages.findOne({ creatorId: m.creatorId, at: { $gt: m.at }, _id: { $ne: m._id } });
    if (newer) { await messages.updateOne({ _id: m._id }, { $set: { status: "failed", error: "superseded by a newer message (human reply or new creator message)" } }); return null; }
    const c = people.get(String(m.creatorId));
    return c && !c.needsHuman && igAllowed(c.igHandle) ? { id: m._id as unknown, igHandle: c.igHandle, igUrl: `https://www.instagram.com/${c.igHandle}/`, text: m.text, rank: creatorRank(c, ranks) } : null;
  }))).filter((i): i is NonNullable<typeof i> => !!i);
  items.sort((a, b) => a.rank - b.rank); // stable: high-priority campaigns' replies are typed first
  return Response.json({ items: items.map((i) => ({ ...i, priority: PRIORITIES[i.rank] })) });
}
