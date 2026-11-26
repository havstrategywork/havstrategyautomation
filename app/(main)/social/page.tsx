import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Icon, ago, type IconName } from "@/components/ui";
import { Empty } from "@/components/social";

export const dynamic = "force-dynamic";

const TOOLS: { href: string; icon: IconName; title: string; text: string }[] = [
  { href: "/social/planner", icon: "calendar", title: "Planner", text: "Calendar and board of every post" },
  { href: "/social/reports", icon: "chart", title: "Reports", text: "Reach, views and top posts per channel" },
  { href: "/social/bots", icon: "chat", title: "Chat bots", text: "Automatic replies to Instagram DMs" },
];

// Social team home: where every org stands at a glance. Database only (no Buffer/Meta calls), so it opens instantly; the numbers live on Reports.
export default async function Social() {
  const { orgs, botConnections, botFlows } = await db();
  const [list, conns, flows, me] = await Promise.all([orgs.find().sort({ name: 1 }).toArray(), botConnections.find().toArray(), botFlows.find().project<{ igId: string; enabled: boolean }>({ igId: 1, enabled: 1 }).toArray(), currentUser()]);
  const live = flows.filter((f) => f.enabled).length, broken = conns.filter((c) => c.lastError || c.subscribed === false);
  const channels = list.reduce((n, o) => n + (o.buffer?.length ?? 0), 0);
  const admin = me?.role === "admin";

  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">Social media</div>
          <h1>Your clients, <em>at a glance</em></h1>
          <p><b>{list.length}</b> organization{list.length === 1 ? "" : "s"} with <b>{channels}</b> Buffer channel{channels === 1 ? "" : "s"} and <b>{conns.length}</b> Instagram account{conns.length === 1 ? "" : "s"}. {broken.length ? <><b className="warn-txt">{broken.length} need{broken.length === 1 ? "s" : ""} attention.</b></> : "Everything is connected and healthy."}</p>
        </div>
        <div className="row">
          {admin && <Link className="btn ghost" href="/social/orgs"><Icon name="layers" size={16} /> Organizations</Link>}
          <Link className="btn" href="/social/planner"><Icon name="plus" size={16} /> Plan a post</Link>
        </div>
      </section>

      <div className="grid stats">
        <div className="card stat"><div className="label"><span className="ico"><Icon name="layers" /></span>Organizations</div><div className="value">{list.length}</div><div className="sub">clients you manage</div></div>
        <div className="card stat"><div className="label"><span className="ico info"><Icon name="link" /></span>Buffer channels</div><div className="value">{channels}</div><div className="sub">power Planner and Reports</div></div>
        <Link href="/social/bots" className="card stat"><div className="label"><span className="ico good"><Icon name="chat" /></span>Live chat bots</div><div className="value">{live}<small> / {flows.length} flows</small></div><div className="sub">auto-replying to Instagram DMs</div></Link>
        <div className={`card stat${broken.length ? " alert" : ""}`}><div className="label"><span className={`ico ${broken.length ? "warn" : "violet"}`}><Icon name="alert" /></span>Needs attention</div><div className="value">{broken.length}</div><div className="sub">{broken.length ? "Instagram connections with a problem" : "no connection problems"}</div></div>
      </div>

      <div className="tools">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="tool">
            <span className="ico"><Icon name={t.icon} /></span>
            <span className="two"><b>{t.title}</b><small>{t.text}</small></span>
            <Icon name="arrow" size={16} />
          </Link>
        ))}
      </div>

      <div className="section-head"><h2>Organizations</h2>{admin && <Link className="small" href="/social/orgs">Manage</Link>}</div>
      {!list.length ? (
        <Empty icon="layers" title="No organizations yet">{admin && <><Link href="/social/orgs">Add one</Link> to get started.</>}</Empty>
      ) : (
        <div className="grid org-grid">
          {list.map((o) => {
            const id = String(o._id), mine = conns.filter((c) => String(c.orgId) === id), ids = new Set(mine.map((c) => c.igId)), mf = flows.filter((f) => ids.has(f.igId));
            const bad = mine.some((c) => c.lastError || c.subscribed === false);
            return (
              <div key={id} className={`card org-card${bad ? " has-problem" : ""}`}>
                <div className="org-top">
                  <Avatar name={o.name} large />
                  <div className="two"><b>{o.name}</b><small>{bad ? <span className="warn-txt">Connection problem</span> : "All good"}</small></div>
                </div>
                <dl className="org-nums">
                  <div><dt>Buffer channels</dt><dd>{o.buffer?.length ?? 0}</dd></div>
                  <div><dt>Instagram</dt><dd>{mine.length}</dd></div>
                  <div><dt>Bots live</dt><dd>{mf.filter((f) => f.enabled).length}<small> / {mf.length}</small></dd></div>
                </dl>
                {(o.buffer?.length ?? 0) > 0 && <div className="chips org-ch">{o.buffer!.map((b) => <span key={b.channelId} className="chip soft">{b.name} · {b.service}</span>)}</div>}
                {mine.length > 0 && (
                  <ul className="feed">
                    {mine.map((c) => (
                      <li key={String(c._id)}>
                        <Avatar name={c.username ?? c.igId} />
                        <div className="two" style={{ minWidth: 0 }}><b>@{c.username ?? c.igId}</b><small>{c.lastError ? <span className="bad-txt">Problem {ago(c.lastError.at)}: {c.lastError.message.slice(0, 80)}</span> : `connected ${ago(c.connectedAt)}${c.test ? " · test account" : ""}`}</small></div>
                        <span className={`pill ${c.lastError || c.subscribed === false ? "bad" : "live"}`}>{c.lastError ? "Problem" : c.subscribed === false ? "No webhook" : "OK"}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {!mine.length && !(o.buffer?.length) && <p className="muted small" style={{ margin: 0 }}>Nothing connected yet.{admin && <> <Link href="/social/orgs">Set it up</Link>.</>}</p>}
                <div className="org-actions">
                  <Link className="btn ghost small-btn" href={`/social/planner?org=${id}`}><Icon name="calendar" size={14} /> Planner</Link>
                  <Link className="btn ghost small-btn" href={`/social/reports?org=${id}`}><Icon name="chart" size={14} /> Report</Link>
                  <Link className="btn ghost small-btn" href={`/social/bots?org=${id}`}><Icon name="chat" size={14} /> Bots</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
