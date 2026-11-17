import { unauthorized } from "@/lib/auth";
import { db, IG_CAP, igAllowed, inScope, sentToday } from "@/lib/db";
import { isPaused } from "@/lib/control";

// What Claude-in-Chrome should DM right now: queued IG items, limited to today's remaining cap.
export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const paused = await isPaused();
  if (paused) return Response.json({ paused: paused.reason, remaining: 0, items: [] });
  const limit = Number(new URL(req.url).searchParams.get("limit")) || Infinity; // batch size for this run
  const { outreach, creators } = await db();
  const sent = await sentToday("ig");
  const remaining = Math.max(0, IG_CAP - sent);
  const queued = await outreach.find({ channel: "ig", status: "queued" }).sort({ createdAt: 1 }).limit(500).toArray();
  const all = await Promise.all(queued.map(async (o) => {
    const c = await creators.findOne({ _id: o.creatorId });
    return { id: o._id, message: o.message, igHandle: c?.igHandle, igUrl: c?.igHandle && `https://www.instagram.com/${c.igHandle}/`, mine: await inScope(c) };
  }));
  const items = all.filter((i) => i.mine && igAllowed(i.igHandle)).slice(0, Math.min(remaining, limit)).map(({ mine, ...i }) => i); // allowlist = test mode; mine = CLIENT_SCOPE
  return Response.json({ cap: IG_CAP, sentToday: sent, remaining, testMode: !!process.env.IG_ALLOWLIST, heldBack: all.length - items.length, items });
}
