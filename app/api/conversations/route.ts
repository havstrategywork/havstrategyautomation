import { unauthorized } from "@/lib/auth";
import { db, igAllowed, inScope } from "@/lib/db";
import { clientFor, threads } from "@/lib/threads";

/**
 * ?view=watch   which creators' threads Claude should open in the Instagram inbox. It must ignore every other thread.
 * ?view=pending threads where the creator spoke last and no human has taken over: these need a reply from Claude.
 */
export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const view = new URL(req.url).searchParams.get("view") ?? "pending";

  if (view === "watch") {
    const { creators } = await db();
    const rows = await creators.find({ igHandle: { $exists: true }, $or: [{ dmSentAt: { $exists: true } }, { status: { $in: ["DM Sent", "Replied", "Negotiating"] } }], status: { $nin: ["Declined"] } }).toArray();
    const { messages } = await db();
    const out = [];
    for (const c of rows.filter((c) => igAllowed(c.igHandle))) {
      if (!(await inScope(c))) continue; // another client's creator: never in this worker's watch list
      const last = await messages.find({ creatorId: c._id! }).sort({ at: -1 }).limit(1).next();
      // lastLogged = the newest message already in our log. Post only messages that come AFTER it in the Instagram thread.
      out.push({ creatorId: c._id, igHandle: c.igHandle, status: c.status ?? "New", escalated: !!c.needsHuman, lastLogged: last && { from: last.direction === "in" ? "creator" : last.by === "human" ? "human" : "claude", text: last.text } });
    }
    return Response.json(out);
  }

  const out = [];
  for (const { creator: c, last, thread } of await threads()) {
    if (last.direction !== "in" || c.needsHuman || c.status === "Declined" || !igAllowed(c.igHandle) || !(await inScope(c))) continue;
    const cl = await clientFor(c);
    out.push({
      creatorId: c._id, name: c.name, igHandle: c.igHandle, status: c.status, quotedRate: c.quotedRate, agreedRate: c.agreedRate,
      client: cl && { id: cl._id, name: cl.name, offer: cl.offer, notes: cl.notes, maxRate: cl.maxRate, tierRates: cl.tierRates },
      thread: thread.map((m) => ({ from: m.direction === "in" ? "creator" : m.by === "human" ? "human" : "claude", text: m.text, at: m.at })),
    });
  }
  return Response.json(out);
}
