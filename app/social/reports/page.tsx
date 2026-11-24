import Link from "next/link";
import { Suspense } from "react";
import { ObjectId } from "mongodb";
import { db, type BotConnection } from "@/lib/db";
import { buildReport, label, parseRange, pctChange, topBy, todayIn, TOTALS, type Content, type Range, type Report, type Sec } from "@/lib/igreport";
import { demoReport } from "@/lib/igdemo";
import { unseal } from "@/lib/secrets";
import { currentUser } from "@/lib/session";
import { Avatar, Icon, PageHead } from "@/components/ui";
import { BarList, fmt } from "@/components/charts";
import PrintButton from "@/components/PrintButton";
import { Delta, OrgTabs } from "@/components/social";
import { DateRange } from "@/components/mui/DateField";
import Select from "@/components/mui/Select";

export const dynamic = "force-dynamic";

const sub = <T,>(s: Sec<T>): T | undefined => (s.ok ? s.data : undefined);
const errorsOf = (r: Report) => [...new Set([r.account, r.totals, r.split, r.media, ...Object.values(r.audience)].flatMap((s) => (s.ok ? [] : [s.error])))];

function Kpi({ label, cur, prev, big }: { label: string; cur: number | null | undefined; prev: number | null | undefined; big?: boolean }) {
  return (
    <div className={`kpi${big ? " big" : ""}`} title={prev == null ? undefined : `Previous period: ${fmt(prev)}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{fmt(cur ?? null)}</div>
      <Delta cur={cur} prev={prev} />
    </div>
  );
}

function Tile({ c }: { c: Content }) {
  const s = c.stats, bits = [s.reach !== undefined && `reach ${fmt(s.reach)}`, s.views !== undefined && `views ${fmt(s.views)}`, s.likes !== undefined && `${fmt(s.likes)} likes`, s.comments !== undefined && `${fmt(s.comments)} comments`, s.shares !== undefined && `${fmt(s.shares)} shares`, s.interactions !== undefined && `${fmt(s.interactions)} interactions`].filter(Boolean);
  return (
    <li className="tile">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {c.img ? <img src={c.img} alt="" width={56} height={56} loading="lazy" referrerPolicy="no-referrer" /> : <span className="thumb-empty" aria-hidden="true" />}
      <div className="two" style={{ minWidth: 0 }}>
        <span className="clamp">{c.text || "(no caption)"}</span>
        <small>{c.at ? new Date(c.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}{bits.length ? ` · ${bits.join(" · ")}` : ""}</small>
      </div>
      {c.url && <a className="small" href={c.url} target="_blank" rel="noopener noreferrer">Open</a>}
    </li>
  );
}

async function AccountReport({ conn, range }: { conn: BotConnection; range: Range }) {
  const head = <div className="who"><Avatar name={conn.username ?? conn.igId} /><div className="two"><b>@{conn.username ?? conn.igId}</b><small>Instagram</small></div></div>;
  let r: Report;
  if (conn.test) r = demoReport(range, conn.igId); // test accounts have no Meta connection: made-up numbers, labelled below
  else {
    let token: string;
    try { token = unseal(conn.token); } catch { return <div className="card rep">{head}<div className="notice" style={{ margin: ".8rem 0 0", borderLeftColor: "var(--bad)" }}>The saved Meta token can no longer be read. An admin needs to reconnect this account.</div></div>; }
    r = await buildReport(token, conn.igId, range);
  }
  const t = sub(r.totals), account = sub(r.account), media = sub(r.media) ?? [], errors = errorsOf(r), aggregated = (t?.windows ?? 1) > 1;

  return (
    <div className="card rep">
      <div className="acct-head">
        <Avatar name={conn.username ?? conn.igId} large />
        <div className="two"><b>@{account?.username ?? conn.username ?? conn.igId}</b><small>Instagram{conn.test ? " · test account" : ""}</small></div>
        <div className="acct-stats">
          {account?.followers !== undefined && <div><b>{fmt(account.followers)}</b><small>followers</small></div>}
          {account?.media !== undefined && <div><b>{fmt(account.media)}</b><small>posts</small></div>}
        </div>
      </div>
      {conn.test && <div className="notice" style={{ margin: ".8rem 0 0", borderLeftColor: "var(--info)" }}><b>Demo data.</b> This is a test account, so these numbers are made up to show how the report looks.</div>}
      {errors.length > 0 && <div className="notice" style={{ margin: ".8rem 0 0", borderLeftColor: "var(--warn)" }}><b>Some numbers could not load:</b> {errors.slice(0, 3).join(" ")}</div>}

      <h3>Summary</h3>
      {[TOTALS.slice(0, 4), TOTALS.slice(4)].map((group, i) => (
        <div key={i} className={`kpis${i === 0 ? " hero4" : ""}`}>
          {group.map((m) => <Kpi key={m.key} big={i === 0} label={aggregated && m.kind === "unique" ? `${m.label} (avg per 30 days)` : m.label} cur={t?.cur[m.key]} prev={t?.prev[m.key]} />)}
        </div>
      ))}

      <h3>By format (last 30 days of the period)</h3>
      <div className="aud">
        {(["views", "reach", "total_interactions"] as const).map((k) => <BarList key={k} title={k === "views" ? "Views" : k === "reach" ? "Reach" : "Interactions"} items={(sub(r.split)?.[k] ?? []).map((d) => ({ ...d, key: label("format", d.key) }))} />)}
      </div>

      <h3>Top posts and reels</h3>
      {([["Posts (by interactions)", media.filter((c) => c.kind === "post"), "interactions"], ["Reels (by views)", media.filter((c) => c.kind === "reel"), "views"]] as const).map(([name, items, key]) => (
        <div key={name}>
          <div className="small muted" style={{ margin: ".6rem 0 .3rem" }}>{name}</div>
          {items.length ? <ul className="tiles">{topBy([...items], key).map((c) => <Tile key={c.id} c={c} />)}</ul> : <p className="muted small" style={{ margin: 0 }}>{r.media.ok ? "None in this period." : "Could not load."}</p>}
        </div>
      ))}

      <h3>Audience</h3>
      <p className="muted small" style={{ marginTop: 0 }}>Followers, this month. Instagram only shares this from 100 followers.</p>
      <div className="aud">
        <BarList title="Gender" items={sub(r.audience.gender) ?? []} />
        <BarList title="Age" items={[...(sub(r.audience.age) ?? [])].sort((x, y) => x.key.localeCompare(y.key, undefined, { numeric: true }))} max={12} />
        <BarList title="Top countries" items={sub(r.audience.country) ?? []} />
        <BarList title="Top cities" items={sub(r.audience.city) ?? []} />
      </div>

      <details style={{ marginTop: "1rem" }}>
        <summary className="small"><b>All numbers</b></summary>
        <div className="tablewrap" style={{ marginTop: ".5rem" }}>
          <table>
            <thead><tr><th>Metric</th><th>This period</th><th>Previous</th><th>Change</th></tr></thead>
            <tbody>
              {TOTALS.map((m) => { const c = t?.cur[m.key], p = t?.prev[m.key], d = pctChange(c, p); return <tr key={m.key}><td>{m.label}</td><td>{fmt(c ?? null)}</td><td className="muted">{fmt(p ?? null)}</td><td>{d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`}</td></tr>; })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export default async function Reports({ searchParams }: { searchParams: Promise<{ org?: string; acc?: string | string[]; range?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const today = todayIn(), { range, preset } = parseRange(sp, today);
  const { orgs, botConnections } = await db();
  const [list, me] = await Promise.all([orgs.find().sort({ name: 1 }).toArray(), currentUser()]);
  const org = list.find((o) => String(o._id) === sp.org) ?? list[0];
  const accounts = org ? await botConnections.find({ orgId: org._id as ObjectId }).sort({ username: 1 }).toArray() : [];
  const picked = [sp.acc ?? []].flat();
  const chosen = picked.length && !picked.includes("all") ? accounts.filter((a) => picked.includes(String(a._id))) : accounts; // nothing picked (or "all") = every account
  const on = new Set(chosen.map((a) => String(a._id)));

  const keep = (extra: Record<string, string> = {}) => new URLSearchParams({ range: preset, ...(preset === "custom" && { from: range.from, to: range.to }), ...extra });
  const exportQs = new URLSearchParams({ org: String(org?._id ?? ""), from: range.from, to: range.to }); chosen.forEach((a) => exportQs.append("acc", String(a._id)));

  return (
    <>
      <PageHead title="Reports" sub="Instagram performance straight from Meta, one column per account.">
        {chosen.length > 0 && (<><a className="btn ghost" href={`/social/reports/export?${exportQs}`}>Export CSV</a><PrintButton /></>)}
      </PageHead>

      {!list.length ? (
        <div className="card empty">No organizations yet.{me?.role === "admin" && <> <Link href="/social/orgs">Add one</Link>.</>}</div>
      ) : (
        <>
          <OrgTabs orgs={list} current={String(org._id)} href={(id) => `/social/reports?${keep({ org: id })}`} />

          {accounts.length ? (
            <form className="card form noprint filters" method="get" action="/social/reports">
              <input type="hidden" name="org" value={String(org._id)} />
              <div className="row spread">
                <h2 style={{ margin: 0 }}>Instagram accounts <span className="muted small">({chosen.length} of {accounts.length} selected)</span></h2>
                <Link className="small" href={`/social/reports?${keep({ org: String(org._id), acc: "all" })}`}>Select all</Link>
              </div>
              <div className="row">
                {accounts.map((a) => (
                  <label key={String(a._id)} className="acct-pick">
                    <input type="checkbox" name="acc" value={String(a._id)} defaultChecked={on.has(String(a._id))} style={{ width: "auto" }} />
                    <Avatar name={a.username ?? a.igId} /><span className="two"><b>@{a.username ?? a.igId}</b><small>{a.test ? "test account" : "Instagram"}</small></span>
                  </label>
                ))}
              </div>
              <div className="f2" style={{ alignItems: "end" }}>
                <Select label="Period" name="range" defaultValue={preset} options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "custom", label: "Custom range (dates on the right, up to 90 days)" }]} />
                <DateRange from={range.from} to={range.to} max={today} />
              </div>
              <div className="row spread"><button>Show report</button><span className="small muted">{range.from} to {range.to}, compared with the same number of days before.</span></div>
            </form>
          ) : (
            <div className="card empty">{org.name} has no Instagram accounts connected yet.{me?.role === "admin" ? <> Connect them on the <Link href="/social/orgs">Organizations</Link> page.</> : " Ask an admin to connect them."}</div>
          )}

          {chosen.length > 0 && (
            <>
              <p className="small muted print-only" style={{ margin: "1rem 0 0" }}>{org.name} · {range.from} to {range.to}</p>
              <div className="rep-grid">
                {chosen.map((a) => (
                  <Suspense key={`${a._id}${range.from}${range.to}`} fallback={<div className="card"><div className="who"><Avatar name={a.username ?? a.igId} /><div className="two"><b>@{a.username ?? a.igId}</b><small>Loading from Meta…</small></div></div></div>}>
                    <AccountReport conn={a} range={range} />
                  </Suspense>
                ))}
              </div>
              <p className="small muted" style={{ marginTop: ".75rem" }}><Icon name="pulse" size={13} /> Numbers come from Meta&apos;s Instagram Insights and can lag up to 48 hours. Reach and accounts engaged count distinct people, so for periods longer than 30 days they show the average per 30 days.</p>
            </>
          )}
        </>
      )}
    </>
  );
}
