import { unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { MAILBOXES, MAIL_STATUSES, threadKey, type MailStatus } from "@/lib/mail";

// The email agent reports here (Bearer API_KEY), after every batch of threads and once more at the end of a run (the final one carries `run`). It never touches the Instagram run lock or pause switch.
// POST { threads: [{ mailbox, email, subject, status, name?, category?, price?, note?, url?, followUpSent? }], run?: { ok, note } }
//   Upserts by mailbox + sender email + subject; only the fields you send change. followUpSent:true adds 1 to the thread's follow-up count.
export async function POST(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const b = await req.json().catch(() => null);
  const items: Record<string, unknown>[] = Array.isArray(b?.threads) ? b.threads.slice(0, 100) : [];
  if (!items.length && !b?.run) return Response.json({ error: "send { threads: [...] } and/or { run: { ok, note } }" }, { status: 400 });
  const { mailThreads, mailRuns } = await db();
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const saved: string[] = [], errors: { index: number; error: string }[] = [];

  for (const [i, t] of items.entries()) {
    const mailbox = String(t.mailbox ?? "").toLowerCase(), email = text(t.email, 200)?.toLowerCase(), subject = text(t.subject, 300) ?? "(no subject)";
    if (!(mailbox in MAILBOXES)) { errors.push({ index: i, error: `mailbox must be ${Object.keys(MAILBOXES).join(" or ")}` }); continue; }
    if (!email?.includes("@")) { errors.push({ index: i, error: "email (the sender's address) is required" }); continue; }
    if (t.status !== undefined && !MAIL_STATUSES.includes(t.status as MailStatus)) { errors.push({ index: i, error: `status must be one of ${MAIL_STATUSES.join(", ")}` }); continue; }
    const url = text(t.url, 500);
    const set = Object.fromEntries(Object.entries({
      name: text(t.name, 120), category: text(t.category, 80), status: t.status, price: text(t.price, 60), note: text(t.note, 500),
      url: url && /^https:\/\/mail\.hostinger\.com\//.test(url) ? url : undefined, // only ever link to Hostinger webmail
    }).filter(([, v]) => v !== undefined));
    const key = threadKey(mailbox, email, subject), now = new Date();
    await mailThreads.updateOne({ key }, {
      $set: { ...set, mailbox, email, subject, updatedAt: now, ...(t.followUpSent === true && { lastFollowUpAt: now }) },
      $inc: { followUps: t.followUpSent === true ? 1 : 0 },
      $setOnInsert: { key, createdAt: now, ...(!set.status && { status: "awaiting_sender" }) },
    }, { upsert: true });
    saved.push(key);
  }
  if (b?.run) await mailRuns.insertOne({ at: new Date(), ok: b.run.ok !== false, note: text(b.run.note, 1000) });
  return Response.json({ saved: saved.length, errors });
}

// Open conversations (what the agent is still waiting on), so it can decide about follow-ups. ?status=closed etc. also works.
export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const s = new URL(req.url).searchParams.get("status");
  const filter = s ? { status: s as MailStatus } : { status: { $in: ["negotiating", "follow_up", "awaiting_sender"] as MailStatus[] } };
  const rows = await (await db()).mailThreads.find(filter).sort({ updatedAt: -1 }).limit(200).toArray();
  return Response.json({ threads: rows.map(({ _id, key, ...r }) => ({ id: String(_id), ...r })) });
}
