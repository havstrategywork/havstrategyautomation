import Link from "next/link";
import { Suspense } from "react";
import { ObjectId } from "mongodb";
import { db, type SocialAccount } from "@/lib/db";
import { buildReport, METRICS, parseRange, pctChange, periodValue, topBy, todayIn, type Content, type Range, type Report, type Sec } from "@/lib/igreport";
import type { Creds } from "@/lib/metricool";
import { unseal } from "@/lib/secrets";
import { currentUser } from "@/lib/session";
import { Avatar, Icon, PageHead } from "@/components/ui";
import { BarList, fmt, LineChart } from "@/components/charts";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const C1 = "var(--c1)", C2 = "var(--c2)";
const sub = <T,>(s: Sec<T>): T | undefined => (s.ok ? s.data : undefined);
const errorsOf = (r: Report) => [...new Set([...Object.values(r.series), r.content.posts, r.content.reels, r.content.stories, ...Object.values(r.audience)].flatMap((s) => (s.ok ? [] : [s.error])))];

function Kpi({ label, cur, prev, unit }: { label: string; cur: number | null; prev: number | null; unit?: string }) {
  const d = pctChange(cur, prev);
  return (
    <div className="kpi" title={prev === null ? undefined : `Previous period: ${fmt(prev, unit)}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{fmt(cur, unit)}</div>
      <div className="kpi-delta muted">{d === null ? "no comparison" : `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}% vs previous`}</div>
    </div>
  );
}

function Tile({ c }: { c: Content }) {
  const s = c.stats, bits = [s.reach !== undefined && `reach ${fmt(s.reach)}`, s.views !== undefined && `views ${fmt(s.views)}`, s.likes !== undefined && `${fmt(s.likes)} likes`, s.comments !== undefined && `${fmt(s.comments)} comments`, s.saved !== undefined && `${fmt(s.saved)} saves`, s.shares !== undefined && `${fmt(s.shares)} shares`, s.replies !== undefined && `${fmt(s.replies)} replies`, s.engagement !== undefined && `eng ${s.engagement.toFixed(1)}%`].filter(Boolean);
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

async function AccountReport({ creds, a, range }: { creds: Creds; a: SocialAccount; range: Range }) {
  const r = await buildReport(creds, a.blogId, range);
  const m = (k: string) => METRICS.find((x) => x.key === k)!;
  const cur = (k: string) => { const s = r.series[k]; return s.ok ? periodValue(s.data, r.range, m(k).kind) : null; };
  const prev = (k: string) => { const s = r.series[k]; return s.ok ? periodValue(s.data, r.prev, m(k).kind) : null; };
  const pts = (k: string) => (sub(r.series[k]) ?? []).filter((p) => p.t >= r.range.from && p.t <= r.range.to);
  const kpi = (k: string, label?: string) => <Kpi key={k} label={label ?? m(k).label} cur={cur(k)} prev={prev(k)} unit={m(k).unit} />;
  const errors = errorsOf(r);
  const stories = sub(r.content.stories) ?? [], sum = (k: string) => stories.reduce((t, s) => t + (s.stats[k] ?? 0), 0);

  return (
    <div className="card rep">
      <div className="who"><Avatar name={a.igHandle} /><div className="two"><b>@{a.igHandle}</b><small>{a.brand}</small></div></div>
      {errors.length > 0 && <div className="notice" style={{ margin: ".8rem 0 0", borderLeftColor: "var(--warn)" }}><b>Some numbers could not load:</b> {errors.slice(0, 3).join(" ")}</div>}

      <h3>Growth</h3>
      <div className="kpis">{[kpi("followers"), kpi("net", "Net followers"), kpi("gained"), kpi("lost"), kpi("clicks")]}</div>
      <LineChart title="Followers gained and lost" lines={[{ name: "Gained", color: C1, pts: pts("gained") }, { name: "Lost", color: C2, pts: pts("lost") }]} />
      <LineChart title="Net follower change" lines={[{ name: "Net", color: C1, pts: pts("net") }]} />
      {pts("followers").length > 1 && <LineChart title="Followers" lines={[{ name: "Followers", color: C1, pts: pts("followers") }]} />}

      <h3>Posts</h3>
      <div className="kpis">{["p_reach", "p_impr", "p_eng", "p_inter", "p_likes", "p_comm", "p_saves", "p_shares"].map((k) => kpi(k))}</div>
      <LineChart title="Reach (daily)" lines={[{ name: "Reach", color: C1, pts: pts("p_reach") }]} />
      <LineChart title="Impressions (daily)" lines={[{ name: "Impressions", color: C1, pts: pts("p_impr") }]} />
      <LineChart title="Engagement" unit="%" lines={[{ name: "Engagement", color: C1, pts: pts("p_eng") }]} />
      <LineChart title="Interactions" lines={[{ name: "Likes", color: C1, pts: pts("p_likes") }, { name: "Comments", color: C2, pts: pts("p_comm") }]} />

      <h3>Reels</h3>
      <div className="kpis">{["r_views", "r_reach", "r_impr", "r_eng", "r_inter", "r_likes", "r_comm", "r_shares", "r_saved"].map((k) => kpi(k))}</div>
      <LineChart title="Video views (daily)" lines={[{ name: "Views", color: C1, pts: pts("r_views") }]} />
      <LineChart title="Reach (daily)" lines={[{ name: "Reach", color: C1, pts: pts("r_reach") }]} />
      <LineChart title="Engagement" unit="%" lines={[{ name: "Engagement", color: C1, pts: pts("r_eng") }]} />

      <h3>Stories</h3>
      {r.content.stories.ok ? (
        <div className="kpis">
          <div className="kpi"><div className="kpi-label">Stories posted</div><div className="kpi-value">{stories.length}</div></div>
          <div className="kpi"><div className="kpi-label">Reach (total)</div><div className="kpi-value">{fmt(sum("reach"))}</div></div>
          <div className="kpi"><div className="kpi-label">Impressions</div><div className="kpi-value">{fmt(sum("impressions"))}</div></div>
          <div className="kpi"><div className="kpi-label">Replies</div><div className="kpi-value">{fmt(sum("replies"))}</div></div>
          <div className="kpi"><div className="kpi-label">Exits</div><div className="kpi-value">{fmt(sum("exits"))}</div></div>
        </div>
      ) : <p className="muted small">Could not load stories.</p>}

      <h3>Top content</h3>
      {([["Posts (by engagement)", r.content.posts, "engagement"], ["Reels (by views)", r.content.reels, "views"], ["Stories (by reach)", r.content.stories, "reach"]] as const).map(([label, s, key]) => (
        <div key={label}>
          <div className="small muted" style={{ margin: ".6rem 0 .3rem" }}>{label}</div>
          {s.ok && s.data.length ? <ul className="tiles">{topBy(s.data, key).map((c) => <Tile key={c.id} c={c} />)}</ul> : <p className="muted small" style={{ margin: 0 }}>{s.ok ? "None in this period." : "Could not load."}</p>}
        </div>
      ))}

      <h3>Audience</h3>
      <p className="muted small" style={{ marginTop: 0 }}>The current audience, so the date range does not change it.</p>
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
              {METRICS.map((x) => {
                const c = cur(x.key), p = prev(x.key), d = pctChange(c, p);
                return <tr key={x.key}><td>{x.group}: {x.label}<small className="muted"> ({x.kind === "avg" ? "daily avg" : x.kind === "last" ? "latest" : "total"})</small></td><td>{fmt(c, x.unit)}</td><td className="muted">{fmt(p, x.unit)}</td><td>{d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`}</td></tr>;
              })}
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
  const { orgs, socialAccounts } = await db();
  const [list, me] = await Promise.all([orgs.find().sort({ name: 1 }).toArray(), currentUser()]);
  const org = list.find((o) => String(o._id) === sp.org) ?? list[0];
  const accounts = org ? await socialAccounts.find({ orgId: org._id as ObjectId }).sort({ igHandle: 1 }).toArray() : [];
  const picked = [sp.acc ?? []].flat();
  const chosen = picked.length && !picked.includes("all") ? accounts.filter((a) => picked.includes(String(a._id))) : accounts; // nothing picked (or "all") = every account
  const on = new Set(chosen.map((a) => String(a._id)));
  let creds: Creds | null = null, credsError = "";
  if (org?.metricool) { try { creds = { userId: org.metricool.userId, token: unseal(org.metricool.token) }; } catch { credsError = "The saved Metricool token can no longer be read. An admin needs to enter it again."; } }
  else if (org) credsError = "This organization has no Metricool login yet.";

  const keep = (extra: Record<string, string> = {}) => new URLSearchParams({ range: preset, ...(preset === "custom" && { from: range.from, to: range.to }), ...extra });
  const exportQs = new URLSearchParams({ org: String(org?._id ?? ""), from: range.from, to: range.to }); chosen.forEach((a) => exportQs.append("acc", String(a._id)));

  return (
    <>
      <PageHead title="Reports" sub="Instagram performance from Metricool, one column per account.">
        {chosen.length > 0 && creds && (<><a className="btn ghost" href={`/social/reports/export?${exportQs}`}>Export CSV</a><PrintButton /></>)}
      </PageHead>

      {!list.length ? (
        <div className="card empty">No organizations yet.{me?.role === "admin" && <> <Link href="/social/orgs">Add one</Link>.</>}</div>
      ) : (
        <>
          <div className="row noprint" style={{ marginBottom: "1rem" }}>
            {list.map((o) => <Link key={String(o._id)} className={`btn ${o._id === org._id ? "" : "ghost"}`} href={`/social/reports?${keep({ org: String(o._id) })}`}>{o.name}</Link>)}
          </div>

          {accounts.length ? (
            <form className="card form noprint" method="get" action="/social/reports">
              <input type="hidden" name="org" value={String(org._id)} />
              <div className="row spread">
                <h2 style={{ margin: 0 }}>Instagram accounts <span className="muted small">({chosen.length} of {accounts.length} selected)</span></h2>
                <Link className="small" href={`/social/reports?${keep({ org: String(org._id), acc: "all" })}`}>Select all</Link>
              </div>
              <div className="row">
                {accounts.map((a) => (
                  <label key={String(a._id)} className="row" style={{ gap: ".5rem", flexWrap: "nowrap", padding: ".4rem .7rem", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer", background: "var(--surface)" }}>
                    <input type="checkbox" name="acc" value={String(a._id)} defaultChecked={on.has(String(a._id))} style={{ width: "auto" }} />
                    <Avatar name={a.igHandle} /><span className="two"><b>@{a.igHandle}</b><small>{a.brand}</small></span>
                  </label>
                ))}
              </div>
              <div className="f2" style={{ alignItems: "end" }}>
                <label>Period
                  <select name="range" defaultValue={preset}>
                    <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="custom">Custom range (dates below)</option>
                  </select>
                </label>
                <label>From<input type="date" name="from" defaultValue={range.from} max={today} /></label>
                <label>To<input type="date" name="to" defaultValue={range.to} max={today} /></label>
              </div>
              <div className="row spread"><button>Show report</button><span className="small muted">{range.from} to {range.to}, compared with the same number of days before.</span></div>
            </form>
          ) : (
            <div className="card empty">{org.name} has no Instagram accounts yet.{me?.role === "admin" ? <> Sync them on the <Link href="/social/orgs">Organizations</Link> page.</> : " Ask an admin to sync them."}</div>
          )}

          {credsError && accounts.length > 0 && <div className="notice" style={{ marginTop: "1rem", borderLeftColor: "var(--bad)" }}>{credsError}</div>}

          {creds && chosen.length > 0 && (
            <>
              <p className="small muted print-only" style={{ margin: "1rem 0 0" }}>{org.name} · {range.from} to {range.to}</p>
              <div className="rep-grid">
                {chosen.map((a) => (
                  <Suspense key={`${a._id}${range.from}${range.to}`} fallback={<div className="card"><div className="who"><Avatar name={a.igHandle} /><div className="two"><b>@{a.igHandle}</b><small>Loading from Metricool…</small></div></div></div>}>
                    <AccountReport creds={creds} a={a} range={range} />
                  </Suspense>
                ))}
              </div>
              <p className="small muted" style={{ marginTop: ".75rem" }}><Icon name="pulse" size={13} /> Reach and engagement are daily averages, the other numbers are totals. Metricool refreshes Instagram data about once a day.</p>
            </>
          )}
        </>
      )}
    </>
  );
}
