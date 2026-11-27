import Link from "next/link";
import { Suspense } from "react";
import { keyFor } from "@/lib/bufferKeys";
import { db, type Org } from "@/lib/db";
import { buildReport, days, KPIS, parseRange, pctChange, prevRange, todayIn, topBy, type Content, type Linked, type Range, type Sec } from "@/lib/buffer";
import { currentUser } from "@/lib/session";
import { Avatar, Icon } from "@/components/ui";
import { fmt } from "@/components/charts";
import PrintButton from "@/components/PrintButton";
import { Delta, Empty, OrgTabs, SocialHead } from "@/components/social";
import { DateRange } from "@/components/mui/DateField";

export const dynamic = "force-dynamic";

const sub = <T,>(s: Sec<T>): T | undefined => (s.ok ? s.data : undefined);
const SERVICE: Record<string, string> = { googlebusiness: "Google Business", linkedin: "LinkedIn", tiktok: "TikTok", youtube: "YouTube", startPage: "Start Page" };
const service = (s: string) => SERVICE[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
const day = (d: string, year = false) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year && { year: "numeric" }), timeZone: "UTC" });
const span = (r: Range) => `${day(r.from)} – ${day(r.to, true)}`;
const PERIODS = [["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["custom", "Custom"]] as const;
const TILE_STATS = [["reach", "reach"], ["impressions", "impr."], ["views", "views"], ["reactions", "reactions"], ["comments", "comments"], ["shares", "shares"], ["saves", "saves"]] as const;

function Kpi({ label, cur, prev, unit, big }: { label: string; cur: number | null | undefined; prev: number | null | undefined; unit?: string; big?: boolean }) {
  return (
    <div className={`kpi${big ? " big" : ""}`} title={prev == null ? undefined : `Previous period: ${fmt(prev, unit)}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{fmt(cur ?? null, unit)}</div>
      <Delta cur={cur} prev={prev} />
    </div>
  );
}

function Tile({ c, rank }: { c: Content; rank: number }) {
  const s = c.stats;
  return (
    <li className="tile">
      <span className="tile-rank">{rank}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {c.img ? <img src={c.img} alt="" width={64} height={64} loading="lazy" referrerPolicy="no-referrer" /> : <span className="thumb-empty" aria-hidden="true"><Icon name="image" size={18} /></span>}
      <div className="tile-body">
        <span className="clamp">{c.text || <span className="muted">(no caption)</span>}</span>
        <div className="mchips">
          {c.at && <span className="mchip date">{day(c.at.slice(0, 10))}</span>}
          {TILE_STATS.filter(([k]) => s[k] !== undefined).map(([k, l]) => <span key={k} className="mchip"><b>{fmt(s[k])}</b> {l}</span>)}
        </div>
      </div>
      {c.url && <a className="icon-link" href={c.url} target="_blank" rel="noopener noreferrer" title="Open post" aria-label="Open post"><Icon name="external" size={15} /></a>}
    </li>
  );
}

function Skeleton({ ch }: { ch: Linked }) {
  return (
    <div className="card rep" aria-busy="true">
      <div className="acct-head"><Avatar name={ch.name} large /><div className="two"><b>{ch.name}</b><small>Loading from Buffer…</small></div></div>
      <div className="kpis hero4">{[0, 1, 2, 3].map((i) => <div key={i} className="kpi big skel" />)}</div>
      <div className="kpis">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="kpi skel" />)}</div>
      {[0, 1, 2].map((i) => <div key={i} className="tile skel" />)}
    </div>
  );
}

async function ChannelReport({ ch, range, org }: { ch: Linked; range: Range; org: Pick<Org, "bufferKey"> }) {
  const r = await buildReport(ch, range, todayIn(), keyFor(org)), t = sub(r.totals), posts = sub(r.posts) ?? [];
  const errors = [...new Set([r.totals, r.posts].flatMap((x) => (x.ok ? [] : [x.error])))];
  return (
    <div className="card rep">
      <div className="acct-head">
        <Avatar name={ch.name} large />
        <div className="two"><b>{ch.name}</b><small>{service(ch.service)}</small></div>
        <span className="acct-range"><Icon name="calendar" size={13} />{span(range)}</span>
      </div>
      {errors.length > 0 && <div className="notice warn" style={{ margin: "0 0 1rem" }}><b>Some numbers could not load:</b> {errors.slice(0, 3).join(" ")}</div>}

      <div className="kpis hero4">{KPIS.slice(0, 4).map((m) => <Kpi key={m.key} big label={m.label} unit={m.unit} cur={t?.cur[m.key]} prev={t?.prev[m.key]} />)}</div>
      <div className="kpis">{KPIS.slice(4).map((m) => <Kpi key={m.key} label={m.label} unit={m.unit} cur={t?.cur[m.key]} prev={t?.prev[m.key]} />)}</div>
      {t && (!r.prev || t.prevError) && <p className="muted small" style={{ margin: ".2rem 0 0" }}>No comparison with the previous period: {t.prevError ?? "Buffer only keeps two years of history."}</p>}

      <h3>Top posts <small>by interactions</small></h3>
      {posts.length ? <ol className="tiles">{topBy(posts, "interactions").map((c, i) => <Tile key={c.id} c={c} rank={i + 1} />)}</ol> : <p className="muted small" style={{ margin: 0 }}>{r.posts.ok ? "No posts sent in this period." : "Could not load."}</p>}

      <details className="allnums">
        <summary>All numbers</summary>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Metric</th><th className="num">This period</th><th className="num">Previous</th><th className="num">Change</th></tr></thead>
            <tbody>
              {KPIS.map((m) => { const c = t?.cur[m.key], p = t?.prev[m.key], d = pctChange(c, p); return <tr key={m.key}><td>{m.label}</td><td className="num">{fmt(c ?? null, m.unit)}</td><td className="num muted">{fmt(p ?? null, m.unit)}</td><td className={`num ${d === null ? "" : d > 0.05 ? "ok" : d < -0.05 ? "down-txt" : ""}`}>{d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`}</td></tr>; })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export default async function Reports({ searchParams }: { searchParams: Promise<{ org?: string; acc?: string | string[]; range?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const today = todayIn(), { range, preset } = parseRange(sp, today), prev = prevRange(range);
  const { orgs } = await db();
  const [list, me] = await Promise.all([orgs.find().sort({ name: 1 }).toArray(), currentUser()]);
  const org = list.find((o) => String(o._id) === sp.org) ?? list[0];
  const accounts: Linked[] = org?.buffer ?? [];
  const picked = [sp.acc ?? []].flat();
  const chosen = picked.length && !picked.includes("all") ? accounts.filter((a) => picked.includes(a.channelId)) : accounts; // nothing picked (or "all") = every channel
  const on = new Set(chosen.map((a) => a.channelId));

  const keep = (extra: Record<string, string> = {}) => new URLSearchParams({ range: preset, ...(preset === "custom" && { from: range.from, to: range.to }), ...extra });
  const exportQs = new URLSearchParams({ org: String(org?._id ?? ""), from: range.from, to: range.to }); chosen.forEach((a) => exportQs.append("acc", a.channelId));

  return (
    <>
      <SocialHead
        icon="chart" title="Reports"
        sub={org ? <>Post performance for <b>{org.name}</b> from Buffer, one column per channel.</> : "Post performance from Buffer, one column per linked channel."}
        actions={chosen.length > 0 && <><a className="btn ghost" href={`/social/reports/export?${exportQs}`}><Icon name="download" size={16} /> Export CSV</a><PrintButton /></>}
      >
        {list.length > 0 && <OrgTabs orgs={list} current={String(org._id)} href={(id) => `/social/reports?${keep({ org: id })}`} />}
      </SocialHead>

      {!keyFor(org) && <div className="notice warn"><b>Buffer is not connected.</b> Add this organization&apos;s Buffer key on the Organizations page, or set BUFFER_API_KEY in the environment (key from publish.buffer.com/settings/api).</div>}

      {!list.length ? (
        <Empty icon="layers" title="No organizations yet">{me?.role === "admin" && <><Link href="/social/orgs">Add one</Link> to start reporting.</>}</Empty>
      ) : !accounts.length ? (
        <Empty icon="link" title={`${org.name} has no Buffer channels yet`}>{me?.role === "admin" ? <>Link them on the <Link href="/social/orgs">Organizations</Link> page.</> : "Ask an admin to link them."}</Empty>
      ) : (
        <>
          <form className="card filterbar noprint" method="get" action="/social/reports">
            <input type="hidden" name="org" value={String(org._id)} />
            <div className="fb-row">
              <span className="fb-label">Channels</span>
              <div className="fb-field row">
                {accounts.map((a) => (
                  <label key={a.channelId} className="acct-pick">
                    <input type="checkbox" name="acc" value={a.channelId} defaultChecked={on.has(a.channelId)} className="sr-only" />
                    <Avatar name={a.name} /><span className="two"><b>{a.name}</b><small>{service(a.service)}</small></span>
                    <span className="tick" aria-hidden="true"><Icon name="check" size={12} /></span>
                  </label>
                ))}
                {accounts.length > 1 && <Link className="small" href={`/social/reports?${keep({ org: String(org._id), acc: "all" })}`}>Select all</Link>}
              </div>
            </div>
            <div className="fb-row">
              <span className="fb-label">Period</span>
              <div className="fb-field row">
                <div className="seg" role="radiogroup" aria-label="Period">
                  {PERIODS.map(([v, l]) => <label key={v}><input type="radio" name="range" value={v} defaultChecked={preset === v} className="sr-only" />{l}</label>)}
                </div>
                <div className="fb-range"><DateRange from={range.from} to={range.to} max={today} /></div>
                <button className="fb-go">Show report</button>
              </div>
            </div>
          </form>

          {chosen.length > 0 && (
            <>
              <p className="rep-summary">
                <span><b>{span(range)}</b> · {days(range)} days</span>
                <span className="muted">compared with {span(prev)}</span>
                <span className="print-only">{org.name}</span>
              </p>
              <div className={`rep-grid${chosen.length === 1 ? " one" : ""}`}>
                {chosen.map((a) => (
                  <Suspense key={`${a.channelId}${range.from}${range.to}`} fallback={<Skeleton ch={a} />}>
                    <ChannelReport ch={a} range={range} org={{ bufferKey: org.bufferKey }} />
                  </Suspense>
                ))}
              </div>
              <p className="small muted rep-note"><Icon name="pulse" size={13} /> Numbers come from Buffer, which refreshes them from each network about once a day (new posts can take up to 24 hours). They cover posts sent in the period, not account-wide totals. Buffer has no follower or audience data.</p>
            </>
          )}
          {!chosen.length && <Empty icon="chart" title="No channel selected">Tick at least one channel above and press Show report.</Empty>}
        </>
      )}
    </>
  );
}
