import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Icon, ago } from "@/components/ui";

export const dynamic = "force-dynamic";

// Social team home: where every org stands at a glance. Database only (no Meta calls), so it opens instantly; the numbers live on Reports.
export default async function Social() {
  const { orgs, botConnections, botFlows } = await db();
  const [list, conns, flows, me] = await Promise.all([orgs.find().sort({ name: 1 }).toArray(), botConnections.find().toArray(), botFlows.find().project<{ igId: string; enabled: boolean }>({ igId: 1, enabled: 1 }).toArray(), currentUser()]);
  const live = flows.filter((f) => f.enabled).length, broken = conns.filter((c) => c.lastError || c.subscribed === false);
  const admin = me?.role === "admin";

  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">Social media</div>
          <h1>Your clients, <em>at a glance</em></h1>
          <p><b>{conns.length}</b> Instagram account{conns.length === 1 ? "" : "s"} across <b>{list.length}</b> organization{list.length === 1 ? "" : "s"}. {broken.length ? <><b>{broken.length}</b> need{broken.length === 1 ? "s" : ""} attention.</> : "Everything is connected and healthy."}</p>
        </div>
        <div className="row">
          <Link className="btn ghost" href="/social/bots"><Icon name="chat" size={16} /> Chat bots</Link>
          <Link className="btn" href="/social/reports"><Icon name="chart" size={16} /> Open reports</Link>
        </div>
      </section>

      <div className="grid stats">
        <div className="card stat"><div className="label"><span className="ico"><Icon name="layers" /></span>Organizations</div><div className="value">{list.length}</div><div className="sub">clients you report on</div></div>
        <div className="card stat"><div className="label"><span className="ico violet"><Icon name="users" /></span>Instagram accounts</div><div className="value">{conns.length}</div><div className="sub">connected through Meta</div></div>
        <Link href="/social/bots" className="card stat"><div className="label"><span className="ico good"><Icon name="chat" /></span>Live chat bots</div><div className="value">{live}<small> / {flows.length} flows</small></div><div className="sub">auto-replying to Instagram DMs</div></Link>
        <div className="card stat"><div className="label"><span className={`ico ${broken.length ? "warn" : "info"}`}><Icon name="alert" /></span>Needs attention</div><div className="value" style={broken.length ? { color: "var(--warn)" } : undefined}>{broken.length}</div><div className="sub">{broken.length ? "accounts with a connection problem" : "no connection problems"}</div></div>
      </div>

      <h2 style={{ margin: "2rem 0 .85rem" }}>Organizations</h2>
      {!list.length ? (
        <div className="card empty">No organizations yet.{admin && <> <Link href="/social/orgs">Add one</Link>.</>}</div>
      ) : (
        <div className="grid org-grid">
          {list.map((o) => {
            const mine = conns.filter((c) => String(c.orgId) === String(o._id)), ids = new Set(mine.map((c) => c.igId)), mf = flows.filter((f) => ids.has(f.igId));
            return (
              <div key={String(o._id)} className="card org-card">
                <div className="who"><Avatar name={o.name} large /><div className="two"><b style={{ fontSize: 16 }}>{o.name}</b><small>{mine.length} account{mine.length === 1 ? "" : "s"} · {mf.filter((f) => f.enabled).length} of {mf.length} bots live</small></div></div>
                {mine.length ? (
                  <ul className="feed">
                    {mine.map((c) => (
                      <li key={String(c._id)}>
                        <Avatar name={c.username ?? c.igId} />
                        <div className="two"><b>@{c.username ?? c.igId}</b><small>{c.lastError ? <span style={{ color: "var(--bad)" }}>Problem {ago(c.lastError.at)}: {c.lastError.message.slice(0, 80)}</span> : `connected ${ago(c.connectedAt)}${c.test ? " · test account" : ""}`}</small></div>
                        <span className={`pill ${c.lastError || c.subscribed === false ? "bad" : "live"}`}><i />{c.lastError ? "Problem" : c.subscribed === false ? "No webhook" : "OK"}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted small" style={{ margin: ".8rem 0 0" }}>No Instagram accounts connected yet.{admin && <> <Link href={`/social/connect/start?org=${o._id}`}>Connect one</Link>.</>}</p>}
                <div className="row" style={{ marginTop: "auto", paddingTop: "1rem" }}>
                  <Link className="btn small-btn" href={`/social/reports?org=${o._id}`}><Icon name="chart" size={14} /> Report</Link>
                  <Link className="btn ghost small-btn" href={`/social/bots?org=${o._id}`}><Icon name="chat" size={14} /> Chat bots</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
