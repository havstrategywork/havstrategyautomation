import Link from "next/link";
import { db } from "@/lib/db";
import { PageHead } from "@/components/ui";

export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";
const dayKey = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(d)); // YYYY-MM-DD in IST
const hhmm = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

type Day = {
  hunted: number; queued: number; first: number; follow: number; failed: number; replies: number; claude: number; human: number;
  offers: number; agreed: number; declined: number; escalated: number; runsOk: number; runsBad: number; log: string[];
  briefs: number; undelivered: number; emails: number; sheets: number; answers: number;
};
const blank = (): Day => ({ hunted: 0, queued: 0, first: 0, follow: 0, failed: 0, replies: 0, claude: 0, human: 0, offers: 0, agreed: 0, declined: 0, escalated: 0, runsOk: 0, runsBad: 0, log: [], briefs: 0, undelivered: 0, emails: 0, sheets: 0, answers: 0 });
type Num = Exclude<keyof Day, "log">;
const COLS: [Num, string, string][] = [
  ["briefs", "Briefs in", "New campaign briefs received from the brief chat"],
  ["hunted", "New creators", "Creators added to the database that day (hunted or imported)"],
  ["queued", "DMs queued", "First DMs and follow-ups approved and queued"],
  ["first", "First DMs sent", "First Instagram DMs delivered"],
  ["undelivered", "Not delivered", "DMs Instagram refused to deliver (creator can't receive our messages)"],
  ["follow", "Follow-ups sent", "Follow-up nudges delivered"],
  ["failed", "Failed", "Queued DMs that failed to send"],
  ["replies", "Replies in", "Messages creators sent us"],
  ["claude", "Claude replies", "Replies Claude sent in chats"],
  ["human", "Human replies", "Replies typed by a person directly in Instagram"],
  ["offers", "Offers", "Messages where we stated a price (negotiation moves)"],
  ["agreed", "Deals agreed", "Creators moved to Agreed"],
  ["declined", "Declined", "Creators moved to Declined"],
  ["escalated", "Escalated", "Chats handed to a human"],
  ["sheets", "Review sheets", "Client review sheets created for agreed creators"],
  ["answers", "Client answers", "Client Yes/No answer files uploaded"],
  ["emails", "Guidelines emails", "Guidelines emails sent to creators the client approved"],
];

export default async function Report({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const span = [7, 14, 30].includes(Number(sp.days)) ? Number(sp.days) : 14;
  const keys = Array.from({ length: span }, (_, i) => dayKey(new Date(Date.now() - i * 864e5))); // newest first
  const since = new Date(`${keys[span - 1]}T00:00:00+05:30`);
  const by = new Map(keys.map((k) => [k, blank()]));
  const at = (d?: Date | string) => (d ? by.get(dayKey(d)) : undefined);

  const { creators, outreach, messages, runs, briefs, dealBatches, clients } = await db();
  const [cs, os, ms, rs, bs, ems, bts, cls] = await Promise.all([
    creators.find({}).toArray(),
    outreach.find({ channel: "ig", $or: [{ createdAt: { $gte: since } }, { sentAt: { $gte: since } }] }).toArray(),
    messages.find({ at: { $gte: since } }).toArray(),
    runs.find({ startedAt: { $gte: since } }).sort({ startedAt: 1 }).toArray(),
    briefs.find({ $or: [{ createdAt: { $gte: since } }, { updatedAt: { $gte: since } }] }).toArray(),
    outreach.find({ channel: "email", kind: "guidelines", status: "sent", sentAt: { $gte: since } }).toArray(),
    dealBatches.find({ $or: [{ createdAt: { $gte: since } }, { answeredAt: { $gte: since } }, { sharedAt: { $gte: since } }] }).toArray(),
    clients.find({}).toArray(),
  ]);
  const cname = new Map(cls.map((c) => [String(c._id), c.name]));

  const mine = new Map(cs.map((c) => [String(c._id), c]));
  const who = (id: unknown) => { const c = mine.get(String(id)); return c ? (c.igHandle ? `@${c.igHandle}` : c.name) : ""; };

  for (const c of cs) { const d = c.source === "claude-hunt" ? at(c.createdAt) : undefined; if (d) d.hunted++; }
  for (const o of os) {
    if (!mine.has(String(o.creatorId))) continue;
    const q = at(o.createdAt);
    if (q) { q.queued++; if (o.status === "failed") q.failed++; }
    const s = o.status === "sent" ? at(o.sentAt) : undefined;
    if (s) { if (o.kind === "followup") s.follow++; else s.first++; }
  }
  for (const m of ms) {
    const d = at(m.at); if (!d || !mine.has(String(m.creatorId))) continue;
    if (m.direction === "in") d.replies++;
    else if (m.status !== "queued" && m.status !== "failed") { if (m.by === "human") d.human++; else d.claude++; }
    if (m.direction === "out" && m.price && m.status !== "failed") { d.offers++; d.log.push(`${hhmm(m.at)} offer ${m.price} to ${who(m.creatorId)}`); }
  }
  for (const c of mine.values()) {
    const h = c.igHandle ? `@${c.igHandle}` : c.name;
    if (c.agreedAt) { const d = at(c.agreedAt); if (d) { d.agreed++; d.log.push(`${hhmm(c.agreedAt)} deal agreed with ${h}${c.agreedRate ? ` at ${c.agreedRate}` : ""}`); } }
    if (c.declinedAt) { const d = at(c.declinedAt); if (d) { d.declined++; d.log.push(`${hhmm(c.declinedAt)} ${h} declined`); } }
    if (c.needsHuman?.at) { const d = at(c.needsHuman.at); if (d) { d.escalated++; d.log.push(`${hhmm(c.needsHuman.at)} escalated ${h}: ${c.needsHuman.reason}`); } }
  }
  for (const b of bs) {
    const n = at(b.createdAt); if (n) { n.briefs++; n.log.push(`${hhmm(b.createdAt)} brief received: ${b.client}`); }
    const u = b.status === "approved" ? at(b.updatedAt) : undefined; if (u && b.note) u.log.push(`${hhmm(b.updatedAt)} ${b.client}: ${b.note}`);
  }
  for (const c of mine.values()) if (c.undeliverable?.at) { const d = at(c.undeliverable.at); if (d) { d.undelivered++; d.log.push(`${hhmm(c.undeliverable.at)} DM to ${c.igHandle ? `@${c.igHandle}` : c.name} not delivered: ${c.undeliverable.reason}`); } }
  for (const e of ems) { const d = mine.has(String(e.creatorId)) ? at(e.sentAt) : undefined; if (d && e.sentAt) { d.emails++; d.log.push(`${hhmm(e.sentAt)} guidelines emailed to ${who(e.creatorId)}`); } }
  for (const x of bts) {
    const nm = cname.get(String(x.clientId)) ?? "client";
    const a = at(x.createdAt); if (a) { a.sheets++; a.log.push(`${hhmm(x.createdAt)} review sheet created for ${nm} (${x.creatorIds.length} creators)`); }
    const h = x.sharedAt ? at(x.sharedAt) : undefined; if (h && x.sharedAt) h.log.push(`${hhmm(x.sharedAt)} sheet given to ${nm}`);
    const r = x.answeredAt ? at(x.answeredAt) : undefined; if (r && x.answeredAt) { r.answers++; r.log.push(`${hhmm(x.answeredAt)} client answers uploaded for ${nm}`); }
  }
  for (const r of rs) {
    const d = at(r.startedAt); if (!d) continue;
    r.ok ? d.runsOk++ : d.runsBad++;
    d.log.push(`${hhmm(r.startedAt)} ${r.kind} run ${r.ok ? "ok" : "FAILED"}${r.note ? `: ${r.note}` : ""}`);
  }
  for (const d of by.values()) d.log.sort();

  const total = blank();
  for (const d of by.values()) { for (const [k] of COLS) total[k] += d[k]; total.runsOk += d.runsOk; total.runsBad += d.runsBad; }
  const label = (k: string) => new Date(`${k}T12:00:00+05:30`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
  const tab = (n: number) => <Link key={n} className={`btn ${n === span ? "" : "ghost"}`} href={`/report?days=${n}`}>{n} days</Link>;

  return (
    <>
      <PageHead title="Daily report" sub={`Everything Claude and the team did each day (India time) · last ${span} days`} />
      <div className="row" style={{ marginBottom: "1rem" }}>{[7, 14, 30].map(tab)}</div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Day</th>
              {COLS.map(([k, h, tip]) => <th key={k} title={tip}>{h}</th>)}
              <th title="Scheduled runs that finished (ok / failed)">Runs</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k, i) => {
              const d = by.get(k)!;
              return (
                <tr key={k}>
                  <td style={{ whiteSpace: "nowrap" }}><b>{i === 0 ? "Today" : label(k)}</b>{i === 0 && <div className="small muted">{label(k)}</div>}</td>
                  {COLS.map(([c]) => <td key={c} className={d[c] ? "" : "muted"}>{d[c] as number}</td>)}
                  <td className={d.runsBad ? "" : "muted"}>{d.runsOk}{d.runsBad ? <span style={{ color: "var(--bad)" }}> / {d.runsBad} failed</span> : ""}</td>
                  <td>{d.log.length ? <details><summary className="small">{d.log.length} events</summary><ul className="small" style={{ margin: ".4rem 0 0", paddingLeft: "1.1rem", minWidth: 260 }}>{d.log.map((l, j) => <li key={j}>{l}</li>)}</ul></details> : <span className="muted small">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td><b>Total</b></td>
              {COLS.map(([c]) => <td key={c}><b>{total[c] as number}</b></td>)}
              <td><b>{total.runsOk}</b>{total.runsBad ? <span style={{ color: "var(--bad)" }}> / {total.runsBad} failed</span> : ""}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: ".75rem" }}>Deals, declines, undelivered DMs and runs are only counted from the day they were first recorded; earlier ones have no timestamp.</p>
    </>
  );
}
