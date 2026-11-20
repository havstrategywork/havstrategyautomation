import { unauthorized } from "@/lib/auth";
import { db, igAllowed } from "@/lib/db";
import { cancelFollowups } from "@/lib/outreach";
import { fmtMoney, overCeiling, parseMoney } from "@/lib/money";
import { alreadyLogged, ceilingFor, findCreator, nextAt } from "@/lib/threads";

/**
 * Record a conversation message. Post them OLDEST FIRST so the order is preserved.
 *  in            : { direction:"in",  creatorId | igHandle, text }                 what the creator wrote
 *  out by human  : { direction:"out", by:"human", creatorId | igHandle, text }     a reply a PERSON typed in Instagram. Claude must not answer that thread
 *                                                                                  until the creator writes again. Cancels any queued Claude reply.
 *  out by Claude : { direction:"out", creatorId | igHandle, text, price? }         a reply for Chrome to send. Put ANY price you state in price, e.g. "10k INR".
 * Re-posting a message already among the thread's last 10 is ignored.
 */
export async function POST(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const b = await req.json();
  const text = String(b.text ?? "").trim();
  const c = await findCreator(b);
  if (!c) return Response.json({ error: "creator not found" }, { status: 404 });
  if (!text) return Response.json({ error: "text required" }, { status: 400 });
  const { messages, creators } = await db();

  if (b.direction === "in") {
    if (await alreadyLogged(c._id!, "in", text)) return Response.json({ ok: true, duplicate: true });
    await messages.insertOne({ creatorId: c._id!, direction: "in", text, at: await nextAt(c._id!) });
    await cancelFollowups(c._id!);
    await creators.updateOne({ _id: c._id!, $or: [{ status: "New" }, { status: "DM Sent" }, { status: { $exists: false } }] }, { $set: { status: "Replied" } });
    return Response.json({ ok: true });
  }

  if (b.direction !== "out") return Response.json({ error: 'direction must be "in" or "out"' }, { status: 400 });

  if (b.by === "human") {
    // Claude's own sent replies come back through here too (the poster can't tell them apart); the duplicate check absorbs them.
    if (await alreadyLogged(c._id!, "out", text)) return Response.json({ ok: true, duplicate: true });
    await messages.insertOne({ creatorId: c._id!, direction: "out", by: "human", text, at: await nextAt(c._id!), status: "sent" });
    const cancelled = await messages.updateMany({ creatorId: c._id!, direction: "out", status: "queued" }, { $set: { status: "failed", error: "a human replied first" } });
    return Response.json({ ok: true, cancelledQueuedReplies: cancelled.modifiedCount });
  }

  if (!igAllowed(c.igHandle)) return Response.json({ error: "recipient not in IG_ALLOWLIST (test mode)" }, { status: 403 });
  if (c.needsHuman) return Response.json({ error: "thread is escalated to a human; do not reply", reason: c.needsHuman.reason }, { status: 409 });
  let price: string | undefined;
  if (b.price != null && b.price !== "") {
    const parsed = parseMoney(b.price);
    if (!parsed) return Response.json({ error: `price: can't read "${b.price}". Use a number and currency, e.g. "10k INR".` }, { status: 422 });
    const ceiling = await ceilingFor(c);
    if (!ceiling) return Response.json({ error: "no budget ceiling is set for this creator's client, so Claude may not state any price. Ask for their rate, or escalate." }, { status: 422 });
    const why = overCeiling(parsed, ceiling);
    if (why) return Response.json({ error: `price ${why}. Offer less, or escalate.` }, { status: 422 }); // never echo the ceiling itself
    price = fmtMoney(parsed);
  }
  const r = await messages.insertOne({ creatorId: c._id!, direction: "out", by: "claude", text, at: await nextAt(c._id!), status: "queued", ...(price && { price }) });
  return Response.json({ ok: true, id: r.insertedId });
}
