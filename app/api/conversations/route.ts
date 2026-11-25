import { unauthorized } from "@/lib/auth";
import { db, igAllowed } from "@/lib/db";
import { clientFor, threads } from "@/lib/threads";

/**
 * ?view=watch   which creators' chats Claude should read this run (each has an igUrl: open the profile and click Message, never search the inbox). It must ignore every other thread.
 *               At most ?limit= (default 15): chats with a live conversation first, then whoever was read longest ago, so every creator is covered over a few runs.
 * ?view=pending threads where the creator spoke last and no human has taken over: these need a reply from Claude.
 */
export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const view = new URL(req.url).searchParams.get("view") ?? "pending";

  if (view === "watch") {
    const { creators } = await db();
    const limit = Math.min(50, Number(new URL(req.url).searchParams.get("limit")) || 15);
    const live = (s?: string) => s === "Replied" || s === "Negotiating";
    // ponytail: once a thread is escalated or the deal is settled, a human owns it and Claude has nothing left to do there, so it drops out of the watch rotation
    // (a reply typed in Instagram after that point won't be logged). Re-add it if that gap matters.
    const rows = (await creators.find({ igHandle: { $exists: true }, $or: [{ dmSentAt: { $exists: true } }, { status: { $in: ["DM Sent", "Replied", "Negotiating"] } }], status: { $nin: ["Declined", "Agreed"] }, needsHuman: { $exists: false }, undeliverable: { $exists: false } }).toArray())
      .sort((a, b) => +live(b.status) - +live(a.status) || +(a.watchedAt ?? a.dmSentAt ?? 0) - +(b.watchedAt ?? b.dmSentAt ?? 0));
    const { messages } = await db();
    const out = [];
    for (const c of rows.filter((c) => igAllowed(c.igHandle))) {
      if (out.length >= limit) break;
      await creators.updateOne({ _id: c._id }, { $set: { watchedAt: new Date() } });
      const last = await messages.find({ creatorId: c._id! }).sort({ at: -1 }).limit(1).next();
      // lastLogged = the newest message already in our log. Post only messages that come AFTER it in the Instagram thread.
      out.push({ creatorId: c._id, igHandle: c.igHandle, igUrl: `https://www.instagram.com/${c.igHandle}/`, status: c.status ?? "New", escalated: !!c.needsHuman, lastLogged: last && { from: last.direction === "in" ? "creator" : last.by === "human" ? "human" : "claude", text: last.text } });
    }
    return Response.json(out);
  }

  const out = [];
  for (const { creator: c, last, thread } of await threads()) {
    // a thread with human guidance is pending even if our last message was a queued reply that got cancelled by the escalation
    if ((last.direction !== "in" && !c.guidance) || c.needsHuman || c.status === "Declined" || !igAllowed(c.igHandle)) continue;
    const cl = await clientFor(c);
    out.push({
      creatorId: c._id, name: c.name, igHandle: c.igHandle, status: c.status, quotedRate: c.quotedRate, agreedRate: c.agreedRate,
      ...(c.guidance && { guidance: c.guidance }), // the human's instruction for this thread: follow it (budget rules still apply). Absent = you decide.
      client: cl && { id: cl._id, name: cl.name, offer: cl.offer, notes: cl.notes, maxRate: cl.maxRate, tierRates: cl.tierRates },
      thread: thread.map((m) => ({ from: m.direction === "in" ? "creator" : m.by === "human" ? "human" : "claude", text: m.text, at: m.at })),
    });
  }
  return Response.json(out);
}
