import { unauthorized } from "@/lib/auth";
import { db, IG_CAP, igAllowed, inScope, sentToday } from "@/lib/db";
import { isPaused } from "@/lib/control";
import { conversationActive, enqueueDueFollowups } from "@/lib/outreach";

// What Claude-in-Chrome should DM right now: queued IG items (first DMs and follow-ups), limited to today's remaining cap.
// followUp:true = type it in the EXISTING thread (our first DM is already there); the creator has not replied.
export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const paused = await isPaused();
  if (paused) return Response.json({ paused: paused.reason, remaining: 0, items: [] });
  const limit = Number(new URL(req.url).searchParams.get("limit")) || Infinity; // batch size for this run
  await enqueueDueFollowups(); // follow-ups ride the same queue and the same daily cap
  const { outreach, creators } = await db();
  const sent = await sentToday("ig");
  const remaining = Math.max(0, IG_CAP - sent);
  const queued = await outreach.find({ channel: "ig", status: "queued" }).sort({ createdAt: 1 }).limit(500).toArray();
  const all = (await Promise.all(queued.map(async (o) => {
    const c = await creators.findOne({ _id: o.creatorId });
    if (o.kind === "followup" && (await conversationActive(c))) { // a conversation started after this was queued: drop it, never hand it to the sender
      await outreach.updateOne({ _id: o._id }, { $set: { status: "failed", error: "conversation active" } });
      return null;
    }
    return { id: o._id, followUp: o.kind === "followup", message: o.message, igHandle: c?.igHandle, igUrl: c?.igHandle && `https://www.instagram.com/${c.igHandle}/`, mine: await inScope(c) };
  }))).filter((i): i is NonNullable<typeof i> => !!i);
  all.sort((a, b) => +b.followUp - +a.followUp); // follow-ups first (stable), so a backlog of first DMs can't starve them under the daily cap
  const items = all.filter((i) => i.mine && igAllowed(i.igHandle)).slice(0, Math.min(remaining, limit)).map(({ mine, ...i }) => i); // allowlist = test mode; mine = CLIENT_SCOPE
  return Response.json({ cap: IG_CAP, sentToday: sent, remaining, testMode: !!process.env.IG_ALLOWLIST, heldBack: all.length - items.length, items });
}
