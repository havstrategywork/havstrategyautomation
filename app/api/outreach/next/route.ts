import { unauthorized } from "@/lib/auth";
import { db, IG_CAP, igAllowed, sentToday } from "@/lib/db";
import { isPaused } from "@/lib/control";
import { conversationActive, enqueueDueFollowups } from "@/lib/outreach";
import { PRIORITIES } from "@/lib/priority";
import { priorityRanks } from "@/lib/threads";

// What Claude-in-Chrome should DM right now: queued IG items (first DMs and follow-ups), limited to today's remaining cap.
// followUp:true = type it in the EXISTING thread (our first DM is already there); the creator has not replied.
export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const paused = await isPaused();
  if (paused) return Response.json({ paused: paused.reason, remaining: 0, items: [] });
  const limit = Number(new URL(req.url).searchParams.get("limit")) || Infinity; // batch size for this run
  await enqueueDueFollowups(); // follow-ups ride the same queue and the same daily cap
  const { outreach, creators } = await db();
  const [ranks, sent] = await Promise.all([priorityRanks(), sentToday("ig")]);
  const remaining = Math.max(0, IG_CAP - sent);
  const queued = await outreach.find({ channel: "ig", status: "queued" }).sort({ createdAt: 1 }).limit(500).toArray();
  const people = new Map((queued.length ? await creators.find({ _id: { $in: queued.map((o) => o.creatorId) } }).toArray() : []).map((c) => [String(c._id), c]));
  const all = (await Promise.all(queued.map(async (o) => {
    const c = people.get(String(o.creatorId)) ?? null;
    if (o.kind === "followup" && (await conversationActive(c))) { // a conversation started after this was queued: drop it, never hand it to the sender
      await outreach.updateOne({ _id: o._id }, { $set: { status: "failed", error: "conversation active" } });
      return null;
    }
    return { id: o._id, rank: ranks.get(String(o.clientId)) ?? 1, followUp: o.kind === "followup", message: o.message, igHandle: c?.igHandle, igUrl: c?.igHandle && `https://www.instagram.com/${c.igHandle}/` };
  }))).filter((i): i is NonNullable<typeof i> => !!i);
  // high-priority campaigns first, then follow-ups before first DMs (stable, so a backlog of first DMs can't starve them under the daily cap)
  all.sort((a, b) => a.rank - b.rank || +b.followUp - +a.followUp);
  const items = all.filter((i) => igAllowed(i.igHandle)).slice(0, Math.min(remaining, limit)).map((i) => ({ ...i, priority: PRIORITIES[i.rank] })); // allowlist = test mode
  return Response.json({ cap: IG_CAP, sentToday: sent, remaining, testMode: !!process.env.IG_ALLOWLIST, heldBack: all.length - items.length, items });
}
