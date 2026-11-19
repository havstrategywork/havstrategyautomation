import Link from "next/link";
import { revalidatePath } from "next/cache";
import { db, IG_CAP, sentToday } from "@/lib/db";
import { STATUSES } from "@/lib/fields";
import { controlState } from "@/lib/control";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, Icon, ago } from "@/components/ui";
import Funnel, { type FunnelStage } from "@/components/Funnel";

export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";
// colour classes live in globals.css (.st-*), so the pipeline follows light/dark
const st = (s: string) => `st-${s.split(" ")[0].toLowerCase()}`;
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); // YYYY-MM-DD in IST

async function resume() {
  "use server";
  if (!(await currentUser())) return;
  await (await db()).control.updateOne({ _id: "state" }, { $unset: { paused: "" } });
  revalidatePath("/");
}

export default async function Dashboard() {
  const user = await currentUser();
  const ctl = await controlState();
  const { creators, clients, outreach, briefs } = await db();
  const since = new Date(Date.now() - 14 * 864e5);
  const startToday = new Date(new Date().setHours(0, 0, 0, 0));
  const offersFilter = { $or: [{ quotedRate: { $exists: true, $ne: "" } }, { status: { $in: ["Negotiating", "Agreed"] } }] };
  const [
    needsYou, nCreators, igQueued, ig, byStatus, recent, perDay, awaiting, escalated,
    nBrands, brandsList, influencersList, followupsToday, followupsList, offersCount, offersList, dealsList,
  ] = await Promise.all([
    creators.countDocuments({ needsHuman: { $exists: true } }), creators.countDocuments(),
    outreach.countDocuments({ channel: "ig", status: "queued" }), sentToday("ig"),
    creators.aggregate<{ _id: string; n: number }>([{ $group: { _id: { $ifNull: ["$status", "New"] }, n: { $sum: 1 } } }]).toArray(),
    outreach.find({ channel: "ig" }).sort({ createdAt: -1 }).limit(7).toArray(),
    outreach.aggregate<{ _id: string; n: number }>([
      { $match: { channel: "ig", status: "sent", sentAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$sentAt", timezone: TZ } }, n: { $sum: 1 } } },
    ]).toArray(),
    briefs.find({ status: "awaiting_approval" }).project<{ _id: unknown; client: string }>({ client: 1 }).limit(5).toArray(),
    creators.find({ needsHuman: { $exists: true } }).project<{ _id: unknown; name: string; igHandle?: string; needsHuman: { reason: string } }>({ name: 1, igHandle: 1, needsHuman: 1 }).limit(4).toArray(),
    // funnel: brands -> influencers -> follow-ups sent today -> offers -> deals agreed
    clients.countDocuments(),
    clients.find().sort({ name: 1 }).limit(20).project<{ _id: unknown; name: string; niches?: string[]; locations?: string[]; maxRate?: string }>({ name: 1, niches: 1, locations: 1, maxRate: 1 }).toArray(),
    creators.find().sort({ createdAt: -1 }).limit(20).project<{ _id: unknown; name: string; igHandle?: string; followers: number; status?: string }>({ name: 1, igHandle: 1, followers: 1, status: 1 }).toArray(),
    outreach.countDocuments({ channel: "ig", kind: "followup", status: "sent", sentAt: { $gte: startToday } }),
    outreach.find({ channel: "ig", kind: "followup", status: "sent", sentAt: { $gte: startToday } }).sort({ sentAt: -1 }).limit(20).toArray(),
    creators.countDocuments(offersFilter),
    creators.find(offersFilter).sort({ lastChecked: -1 }).limit(20).project<{ _id: unknown; name: string; igHandle?: string; quotedRate?: string; status?: string }>({ name: 1, igHandle: 1, quotedRate: 1, status: 1 }).toArray(),
    creators.find({ status: "Agreed" }).sort({ agreedAt: -1 }).limit(20).project<{ _id: unknown; name: string; igHandle?: string; agreedRate?: string; agreedAt?: Date }>({ name: 1, igHandle: 1, agreedRate: 1, agreedAt: 1 }).toArray(),
  ]);
  const count = new Map(byStatus.map((s) => [s._id, s.n]));
  const c = (s: string) => count.get(s) ?? 0;
  const responded = c("Replied") + c("Negotiating") + c("Agreed") + c("Declined");
  const contacted = responded + c("DM Sent");
  const rate = contacted ? Math.round((responded / contacted) * 100) : 0;
  const people = new Map((await creators.find({ _id: { $in: recent.map((o) => o.creatorId) } }).project<{ _id: unknown; name: string; igHandle?: string }>({ name: 1, igHandle: 1 }).toArray()).map((p) => [String(p._id), p]));
  const followupPeople = new Map((await creators.find({ _id: { $in: followupsList.map((o) => o.creatorId) } }).project<{ _id: unknown; name: string; igHandle?: string }>({ name: 1, igHandle: 1 }).toArray()).map((p) => [String(p._id), p]));

  const pct = (cur: number, prev: number) => (prev ? Math.round((cur / prev) * 100) : null);
  const dealsAgreed = c("Agreed");
  const funnelStages: FunnelStage[] = [
    {
      key: "brands", label: "Total brands", icon: "briefcase", count: nBrands, pct: null, emptyText: "No clients yet.",
      items: brandsList.map((b) => ({ id: String(b._id), title: b.name, meta: [b.niches?.slice(0, 3).join(", "), b.locations?.slice(0, 2).join(", ")].filter(Boolean).join(" · ") || undefined, right: b.maxRate, href: "/creators" })),
    },
    {
      key: "influencers", label: "Total influencers", icon: "users", count: nCreators, pct: pct(nCreators, nBrands), emptyText: "No creators yet.",
      items: influencersList.map((p) => ({ id: String(p._id), title: p.name, meta: p.igHandle ? `@${p.igHandle} · ${p.followers.toLocaleString("en-IN")} followers` : `${p.followers.toLocaleString("en-IN")} followers`, right: p.status ?? "New", href: `/creators/${p._id}` })),
    },
    {
      key: "followups", label: "Follow-ups sent today", icon: "send", count: followupsToday, pct: pct(followupsToday, nCreators), emptyText: "None sent today yet.",
      items: followupsList.map((o) => { const p = followupPeople.get(String(o.creatorId)); return { id: String(o._id), title: p?.name ?? "Unknown", meta: p?.igHandle ? `@${p.igHandle}` : undefined, right: ago(o.sentAt), href: p ? `/creators/${o.creatorId}` : undefined }; }),
    },
    {
      key: "offers", label: "Offers", icon: "bolt", count: offersCount, pct: pct(offersCount, followupsToday), emptyText: "No offers in play.",
      items: offersList.map((p) => ({ id: String(p._id), title: p.name, meta: p.igHandle ? `@${p.igHandle}` : undefined, right: p.quotedRate ?? p.status, href: `/creators/${p._id}` })),
    },
    {
      key: "deals", label: "Deals agreed", icon: "handshake", count: dealsAgreed, pct: pct(dealsAgreed, offersCount), emptyText: "No deals agreed yet.",
      items: dealsList.map((p) => ({ id: String(p._id), title: p.name, meta: p.igHandle ? `@${p.igHandle}` : undefined, right: p.agreedRate ?? ago(p.agreedAt), href: `/creators/${p._id}` })),
    },
  ];

  // last 14 days, oldest first, zero-filled
  const sent = new Map(perDay.map((d) => [d._id, d.n]));
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 864e5);
    return { key: dayKey(d), n: sent.get(dayKey(d)) ?? 0, short: d.toLocaleDateString("en-GB", { day: "numeric", timeZone: TZ }), long: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }) };
  });
  const max = Math.max(IG_CAP, ...days.map((d) => d.n));
  const total14 = days.reduce((n, d) => n + d.n, 0);

  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(new Date()));
  const greet = hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name = (user?.username ?? "there").replace(/^\w/, (x) => x.toUpperCase());
  const lastEnd = ctl.lastRun ? +new Date(ctl.lastRun.endedAt) : 0;
  const stale = !ctl.lastRun || Date.now() - lastEnd > 2 * 3600e3;
  const worker = ctl.paused ? { cls: "bad", text: "Paused" } : ctl.run ? { cls: "info live", text: `Running · ${ctl.run.kind}` } : stale ? { cls: "warn", text: "No recent run" } : { cls: "good", text: "Healthy" };
  const todos = awaiting.length + escalated.length + (ctl.paused ? 1 : 0);

  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ })}</div>
          <h1>{greet}, <em>{name}</em></h1>
          <p>
            <b>{ig}</b> DM{ig === 1 ? "" : "s"} sent today{igQueued ? <>, <b>{igQueued}</b> queued</> : null}.{" "}
            {todos ? <><b>{todos}</b> thing{todos === 1 ? "" : "s"} need{todos === 1 ? "s" : ""} you.</> : "Nothing needs you right now."}
          </p>
        </div>
        <div className="row">
          <Link className="btn ghost" href="/campaigns"><Icon name="layers" size={16} /> Campaigns</Link>
          <Link className="btn" href="/inbox"><Icon name="inbox" size={16} /> Open inbox</Link>
        </div>
      </section>

      {ctl.paused && (
        <div className="notice" style={{ borderLeftColor: "var(--bad)", display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
          <div><b>Automation is paused.</b> {ctl.paused.reason} <span className="muted">({ago(ctl.paused.at)})</span><div className="small muted">No DMs or replies go out until you resume. Check the Instagram account first.</div></div>
          <form action={resume}><button>Resume</button></form>
        </div>
      )}

      <Funnel stages={funnelStages} />

      <div className="grid stats">
        <div className="card stat">
          <div className="label"><span className="ico"><Icon name="send" /></span>DMs today</div>
          <div className="value">{ig}<small> / {IG_CAP}</small></div>
          <div className="bar" role="progressbar" aria-valuenow={ig} aria-valuemax={IG_CAP} aria-label="Daily DM cap used"><i style={{ width: `${Math.min(100, (ig / IG_CAP) * 100)}%` }} /></div>
          <div className="sub" style={{ marginTop: ".55rem" }}>{Math.max(0, IG_CAP - ig)} left today · {igQueued} queued</div>
        </div>
        <div className="card stat">
          <div className="label"><span className="ico violet"><Icon name="chat" /></span>Reply rate</div>
          <div className="value">{rate}<small>%</small></div>
          <div className="sub">{responded} of {contacted} contacted creators replied</div>
        </div>
        <div className="card stat">
          <div className="label"><span className="ico warn"><Icon name="bolt" /></span>In negotiation</div>
          <div className="value">{c("Negotiating")}</div>
          <div className="sub">{c("Declined")} declined so far</div>
        </div>
        <Link href="/inbox" className="card stat">
          <div className="label"><span className={`ico ${needsYou ? "warn" : "info"}`}><Icon name="alert" /></span>Needs you</div>
          <div className="value" style={needsYou ? { color: "var(--warn)" } : undefined}>{needsYou}</div>
          <div className="sub">conversations escalated by Claude</div>
        </Link>
      </div>

      <div className="dash">
        <div className="card">
          <div className="card-head">
            <div><h2>Outreach activity</h2><div className="small muted">DMs sent per day, last 14 days</div></div>
            <div style={{ textAlign: "right" }}><div className="big">{total14}</div><div className="small muted">sent</div></div>
          </div>
          <div className="chart">
            <div className="chart-y" aria-hidden="true"><span>{max}</span><span>{Math.round(max / 2)}</span><span>0</span></div>
            <div className="chart-plot" role="img" aria-label={`DMs sent per day: ${days.map((d) => `${d.long} ${d.n}`).join(", ")}`}>
              {days.map((d, i) => (
                <div key={d.key} className={`col${i === days.length - 1 ? " today" : ""}`} data-tip={`${d.long}: ${d.n} DM${d.n === 1 ? "" : "s"}`}>
                  <i style={{ height: `${(d.n / max) * 100}%` }} />
                  <span>{i % 2 === 1 || i === days.length - 1 ? d.short : ""}</span>
                </div>
              ))}
            </div>
          </div>
          <table className="sr-only"><caption>DMs sent per day</caption><tbody>{days.map((d) => <tr key={d.key}><th>{d.long}</th><td>{d.n}</td></tr>)}</tbody></table>
        </div>

        <div className="grid" style={{ gap: "1rem" }}>
          <div className="card">
            <div className="card-head"><h2>Needs attention</h2>{todos > 0 && <span className="pill warn">{todos}</span>}</div>
            {todos ? (
              <ul className="attention">
                {ctl.paused && <li><Link href="/"><span className="ico warn"><Icon name="alert" /></span><div><b>Automation paused</b><small>Resume once Instagram is fine</small></div><span className="go"><Icon name="arrow" size={16} /></span></Link></li>}
                {awaiting.map((b) => <li key={String(b._id)}><Link href="/campaigns"><span className="ico"><Icon name="layers" /></span><div><b>Approve shortlist: {b.client}</b><small>Cowork found creators for you to review</small></div><span className="go"><Icon name="arrow" size={16} /></span></Link></li>)}
                {escalated.map((p) => <li key={String(p._id)}><Link href="/inbox"><span className="ico violet"><Icon name="chat" /></span><div><b>{p.name}{p.igHandle ? ` · @${p.igHandle}` : ""}</b><small>{p.needsHuman.reason.slice(0, 70)}</small></div><span className="go"><Icon name="arrow" size={16} /></span></Link></li>)}
              </ul>
            ) : <div className="allclear"><Icon name="check" /> All clear. The automation has it.</div>}
          </div>

          <div className="card worker">
            <div className="card-head" style={{ marginBottom: 0 }}><h2>Automation</h2><span className={`pill ${worker.cls}`}>{worker.text}</span></div>
            <dl className="kv">
              <dt>Last run</dt><dd>{ctl.lastRun ? `${ctl.lastRun.kind} · ${ago(ctl.lastRun.endedAt)}${ctl.lastRun.ok ? "" : " (failed)"}` : "never"}</dd>
              {ctl.lastRun?.note && <><dt>Note</dt><dd className="muted">{ctl.lastRun.note.slice(0, 60)}</dd></>}
              <dt>Creators</dt><dd>{nCreators}</dd>
            </dl>
            <Link href="/automation" className="small">Schedules &amp; setup →</Link>
          </div>
        </div>
      </div>

      <div className="dash">
        <div className="card">
          <div className="card-head"><h2>Pipeline</h2><span className="small muted">{nCreators} creators</span></div>
          {nCreators ? (
            <>
              <div className="pipeline" role="img" aria-label={STATUSES.map((s) => `${s} ${c(s)}`).join(", ")}>
                {STATUSES.map((s) => <i key={s} className={st(s)} title={`${s}: ${c(s)}`} style={{ width: `${(c(s) / nCreators) * 100}%` }} />)}
              </div>
              <div className="legend">{STATUSES.map((s) => <Link key={s} href={`/creators?status=${encodeURIComponent(s)}`}><span className={st(s)}>{s}<b>{c(s)}</b></span></Link>)}</div>
            </>
          ) : <div className="empty">No creators yet. Start a brief and Cowork will find some.</div>}
        </div>
        <div className="card">
          <div className="card-head"><h2>Recent outreach</h2><Link href="/outreach" className="small">View all</Link></div>
          {recent.length ? (
            <ul className="feed">{recent.map((o) => {
              const p = people.get(String(o.creatorId));
              return (
                <li key={String(o._id)}>
                  <Avatar name={p?.name ?? "?"} />
                  <div className="two" style={{ minWidth: 0 }}><b>{p?.name ?? "Unknown"}</b><small>{o.kind === "followup" ? "Follow-up" : "First DM"}{p?.igHandle ? ` · @${p.igHandle}` : ""}</small></div>
                  <span className="t"><Badge s={o.status} /> {ago(o.sentAt ?? o.createdAt)}</span>
                </li>
              );
            })}</ul>
          ) : <div className="empty">Nothing queued yet.</div>}
        </div>
      </div>
    </>
  );
}
