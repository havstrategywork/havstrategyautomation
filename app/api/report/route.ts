import { ObjectId } from "mongodb";
import { unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";

// Read-only outreach numbers for one client over a date range (India days, both ends included), plus the same-length period before it.
// GET /api/report?client=<name or id>&from=YYYY-MM-DD&to=YYYY-MM-DD   (range max 93 days). Used by the weekly/monthly report run.
const DAY = 864e5, ISO = /^\d{4}-\d{2}-\d{2}$/, MAX_DAYS = 93;
const istStart = (d: string) => new Date(`${d}T00:00:00+05:30`);
const istDay = (t: Date) => new Date(t.getTime() + 5.5 * 36e5).toISOString().slice(0, 10);
type Win = { from: Date; to: Date }; // from inclusive, to exclusive

export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const u = new URL(req.url).searchParams;
  const name = u.get("client") ?? "", from = u.get("from") ?? "", to = u.get("to") ?? "";
  if (!name || !ISO.test(from) || !ISO.test(to) || to < from) return Response.json({ error: "client, from and to (YYYY-MM-DD, from <= to) are required" }, { status: 400 });
  const W: Win = { from: istStart(from), to: new Date(istStart(to).getTime() + DAY) };
  const len = Math.round((W.to.getTime() - W.from.getTime()) / DAY);
  if (len > MAX_DAYS) return Response.json({ error: `range is at most ${MAX_DAYS} days` }, { status: 400 });
  const P: Win = { from: new Date(W.from.getTime() - len * DAY), to: W.from };

  const { clients, outreach, creators, messages, control } = await db();
  const cl = ObjectId.isValid(name) ? await clients.findOne({ _id: new ObjectId(name) }) : await clients.findOne({ name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
  if (!cl) return Response.json({ error: "client not found" }, { status: 404 });

  const ox = await outreach.find({ clientId: cl._id, channel: "ig" }).toArray();
  const ids = [...new Set(ox.map((o) => String(o.creatorId)))].map((i) => new ObjectId(i));
  const [cs, ms, state] = await Promise.all([creators.find({ _id: { $in: ids } }).toArray(), messages.find({ creatorId: { $in: ids } }).sort({ at: 1 }).toArray(), control.findOne({ _id: "state" })]);
  const within = (x: Date | undefined, w: Win) => !!x && x >= w.from && x < w.to;
  const handleOf = new Map(cs.map((c) => [String(c._id), c]));

  const sent = (w: Win, kind: string) => ox.filter((o) => o.status === "sent" && (o.kind ?? "first") === kind && within(o.sentAt, w)).length;
  const inMsgs = (w: Win) => ms.filter((m) => m.direction === "in" && within(m.at, w));
  const metrics = (w: Win) => ({
    firstDms: sent(w, "first"), followUps: sent(w, "followup"),
    failed: ox.filter((o) => o.status === "failed" && within(o.sentAt ?? o.createdAt, w)).length,
    repliesIn: inMsgs(w).length, creatorsReplied: new Set(inMsgs(w).map((m) => String(m.creatorId))).size,
    ourReplies: ms.filter((m) => m.direction === "out" && m.status !== "queued" && within(m.at, w)).length,
    agreed: cs.filter((c) => c.status === "Agreed" && within(c.agreedAt, w)).length,
    declined: cs.filter((c) => within(c.declinedAt, w)).length,
  });

  const days: { day: string; firstDms: number; followUps: number; repliesIn: number }[] = [];
  for (let i = 0; i < len; i++) {
    const w: Win = { from: new Date(W.from.getTime() + i * DAY), to: new Date(W.from.getTime() + (i + 1) * DAY) };
    days.push({ day: istDay(w.from), firstDms: sent(w, "first"), followUps: sent(w, "followup"), repliesIn: inMsgs(w).length });
  }
  const statuses: Record<string, number> = {};
  for (const c of cs) statuses[c.status ?? "New"] = (statuses[c.status ?? "New"] ?? 0) + 1;
  const failedReasons: Record<string, number> = {};
  for (const o of ox) if (o.status === "failed" && o.kind !== "followup") { const k = (o.error ?? "unknown").slice(0, 80); failedReasons[k] = (failedReasons[k] ?? 0) + 1; }
  const firstSent = ox.filter((o) => o.status === "sent" && (o.kind ?? "first") === "first").length;
  const everReplied = new Set(ms.filter((m) => m.direction === "in").map((m) => String(m.creatorId)));

  return Response.json({
    client: { name: cl.name, priority: cl.priority ?? "normal", offer: cl.offer ?? null, contentDeadline: cl.contentDeadline ?? null },
    period: { from, to, days: len, previous: { from: istDay(P.from), to: istDay(new Date(P.to.getTime() - DAY)) } },
    week: metrics(W), previous: metrics(P), days,
    totals: { onList: ids.length, firstDmsSent: firstSent, everReplied: [...everReplied].length, replyRate: firstSent ? Math.round((everReplied.size / firstSent) * 1000) / 10 : null, statuses, failedReasons, queuedFollowUps: ox.filter((o) => o.status === "queued" && o.kind === "followup").length, needsHuman: cs.filter((c) => c.needsHuman).length, undeliverable: cs.filter((c) => c.undeliverable).length },
    replied: [...new Set(inMsgs(W).map((m) => String(m.creatorId)))].map((id) => { const c = handleOf.get(id); return { igHandle: c?.igHandle, followers: c?.followers, status: c?.status ?? "New", firstReplyText: inMsgs(W).find((m) => String(m.creatorId) === id)?.text.slice(0, 200) }; }),
    deals: cs.filter((c) => ["Agreed", "Negotiating"].includes(c.status ?? "")).map((c) => ({ igHandle: c.igHandle, followers: c.followers, status: c.status, quotedRate: c.quotedRate, agreedRate: c.agreedRate })),
    // replies are only logged when an outreach run reads Instagram: while paused (or after a long gap) the reply numbers can be behind reality
    loggingGap: { paused: state?.paused ?? null, lastRun: state?.lastRun ?? null },
  });
}
