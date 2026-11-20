import { unauthorized } from "@/lib/auth";
import { db, igAllowed } from "@/lib/db";
import { isPaused } from "@/lib/control";

// Queued replies for Claude-in-Chrome to type into the existing conversation (not a new DM).
export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const paused = await isPaused();
  if (paused) return Response.json({ paused: paused.reason, items: [] });
  const { messages, creators } = await db();
  const queued = await messages.find({ direction: "out", status: "queued" }).sort({ at: 1 }).limit(100).toArray();
  const items = [];
  for (const m of queued) {
    const c = await creators.findOne({ _id: m.creatorId });
    const newer = await messages.findOne({ creatorId: m.creatorId, at: { $gt: m.at }, _id: { $ne: m._id } });
    if (newer) { await messages.updateOne({ _id: m._id }, { $set: { status: "failed", error: "superseded by a newer message (human reply or new creator message)" } }); continue; }
    if (c && !c.needsHuman && igAllowed(c.igHandle)) items.push({ id: m._id, igHandle: c.igHandle, igUrl: `https://www.instagram.com/${c.igHandle}/`, text: m.text });
  }
  return Response.json({ items });
}
