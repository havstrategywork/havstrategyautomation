import { unauthorized } from "@/lib/auth";
import { db, igAllowed } from "@/lib/db";
import { PRIORITIES } from "@/lib/priority";
import { clientsFor, creatorRank, priorityRanks, threads } from "@/lib/threads";

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
    const ranks = await priorityRanks();
    const limit = Math.min(50, Number(new URL(req.url).searchParams.get("limit")) || 15);
    const live = (s?: string) => s === "Replied" || s === "Negotiating";
    // ponytail: once a thread is escalated or the deal is settled, a human owns it and Claude has nothing left to do there, so it drops out of the watch rotation
    // (a reply typed in Instagram after that point won't be logged). Re-add it if that gap matters.
    const rows = (await creators.find({ igHandle: { $exists: true }, $or: [{ dmSentAt: { $exists: true } }, { status: { $in: ["DM Sent", "Replied", "Negotiating"] } }], status: { $nin: ["Declined", "Agreed"] }, needsHuman: { $exists: false }, undeliverable: { $exists: false } }).toArray())
      .sort((a, b) => +live(b.status) - +live(a.status) || creatorRank(a, ranks) - creatorRank(b, ranks) || +(a.watchedAt ?? a.dmSentAt ?? 0) - +(b.watchedAt ?? b.dmSentAt ?? 0)); // live chats first, then high-priority campaigns
    const { messages } = await db();
    const batch = rows.filter((c) => igAllowed(c.igHandle)).slice(0, Math.max(0, Math.ceil(limit))), now = Date.now();
    const out = await Promise.all(batch.map(async (c, i) => {
      const [, last] = await Promise.all([
        creators.updateOne({ _id: c._id }, { $set: { watchedAt: new Date(now + i) } }), // +i keeps the order they were handed out, which the rotation sorts by
        messages.find({ creatorId: c._id! }).sort({ at: -1 }).limit(1).next(),
      ]);
      // lastLogged = the newest message already in our log. Post only messages that come AFTER it in the Instagram thread.
      return { creatorId: c._id, igHandle: c.igHandle, igUrl: `https://www.instagram.com/${c.igHandle}/`, status: c.status ?? "New", escalated: !!c.needsHuman, lastLogged: last && { from: last.direction === "in" ? "creator" : last.by === "human" ? "human" : "claude", text: last.text } };
    }));
    return Response.json(out);
  }

  const out: (Record<string, unknown> & { rank: number })[] = [];
  const ranks = await priorityRanks();
  // a thread with human guidance is pending even if our last message was a queued reply that got cancelled by the escalation
  const pending = (await threads()).filter(({ creator: c, last }) => !((last.direction !== "in" && !c.guidance) || c.needsHuman || c.status === "Declined" || !igAllowed(c.igHandle)));
  const clientOf = await clientsFor(pending.map((t) => t.creator));
  for (const { creator: c, thread } of pending) {
    const cl = clientOf(c);
    const rank = creatorRank(c, ranks);
    out.push({
      rank, priority: PRIORITIES[rank],
      creatorId: c._id, name: c.name, igHandle: c.igHandle, status: c.status, quotedRate: c.quotedRate, agreedRate: c.agreedRate,
      ...(c.guidance && { guidance: c.guidance }), // the human's instruction for this thread: follow it (budget rules still apply). Absent = you decide.
      client: cl && { id: cl._id, name: cl.name, offer: cl.offer, notes: cl.notes, maxRate: cl.maxRate, tierRates: cl.tierRates },
      thread: thread.map((m) => ({ from: m.direction === "in" ? "creator" : m.by === "human" ? "human" : "claude", text: m.text, at: m.at })),
    });
  }
  out.sort((a, b) => a.rank - b.rank); // stable: high-priority campaigns' threads first, otherwise the order from threads()
  return Response.json(out);
}
