import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Icon, ago } from "@/components/ui";
import { Empty, OrgTabs, SocialHead } from "@/components/social";
import { createFlow, deleteFlow, toggleFlow } from "./actions";

export const dynamic = "force-dynamic";

// Pick an org, see its connected Instagram accounts, and the flows on each one.
export default async function Bots({ searchParams }: { searchParams: Promise<{ org?: string; m?: string }> }) {
  const sp = await searchParams;
  const { orgs, botConnections, botFlows } = await db();
  const [list, me] = await Promise.all([orgs.find().sort({ name: 1 }).toArray(), currentUser()]);
  const org = list.find((o) => String(o._id) === sp.org) ?? list[0];
  const conns = org ? await botConnections.find({ orgId: org._id! }).sort({ username: 1 }).toArray() : [];
  const flows = conns.length ? await botFlows.find({ igId: { $in: conns.map((c) => c.igId) } }).sort({ createdAt: 1 }).toArray() : [];

  return (
    <>
      <SocialHead icon="chat" title="Chat bots" sub="Automatic replies to Instagram DMs. Build a flow, connect its steps, then switch it on for an account.">
        {list.length > 0 && <OrgTabs orgs={list} current={String(org._id)} href={(id) => `/social/bots?org=${id}`} />}
      </SocialHead>
      {sp.m && <div className="notice" role="status">{sp.m}</div>}

      {!list.length ? (
        <Empty icon="layers" title="No organizations yet">{me?.role === "admin" && <><Link href="/social/orgs">Add one</Link> to get started.</>}</Empty>
      ) : !conns.length ? (
        <Empty icon="camera" title={`No Instagram accounts connected for ${org.name}`}>{me?.role === "admin" ? <>Connect one on the <Link href="/social/orgs">Organizations</Link> page.</> : "Ask an admin to connect them."}</Empty>
      ) : (
        <div className="grid">
          {conns.map((c) => {
            const mine = flows.filter((f) => f.igId === c.igId), on = mine.filter((f) => f.enabled).length;
            return (
              <section key={String(c._id)} className="card acct">
                <div className="acct-bar">
                  <div className="who"><Avatar name={c.username ?? c.igId} large /><div className="two"><b>@{c.username ?? c.igId}</b><small>{on} of {mine.length} flow{mine.length === 1 ? "" : "s"} live{c.test ? " · test account: nothing is sent to Instagram" : ""}</small></div></div>
                  <form action={createFlow} className="inline-form">
                    <input type="hidden" name="conn" value={String(c._id)} />
                    <input name="name" placeholder="Name a new flow…" maxLength={80} aria-label="New flow name" />
                    <button className="small-btn"><Icon name="plus" size={14} /> New flow</button>
                  </form>
                </div>
                {c.lastError && <div className="notice bad"><b>Replies are failing</b> ({ago(c.lastError.at)}): {c.lastError.message}</div>}

                {mine.length ? (
                  <div className="flows">
                    {mine.map((f) => {
                      const trig = f.nodes.find((n) => n.type === "trigger");
                      const kw = trig ? (trig.data as { keywords: string[] }).keywords : [];
                      return (
                        <article key={String(f._id)} className={`flow${f.enabled ? " on" : ""}`}>
                          <div className="flow-top">
                            <Link href={`/social/bots/${f._id}`} className="flow-name">{f.name}</Link>
                            <span className={`pill ${f.enabled ? "live" : ""}`}>{f.enabled ? "Live" : "Off"}</span>
                          </div>
                          <div className="flow-trig"><span className="muted small">Triggers on</span><div className="chips">{kw.length ? kw.slice(0, 5).map((k) => <span key={k} className="chip">{k}</span>) : <span className="chip soft">every message</span>}{kw.length > 5 && <span className="chip soft">+{kw.length - 5}</span>}</div></div>
                          <small className="muted">{f.nodes.length} steps · edited {ago(f.updatedAt)}</small>
                          <div className="flow-actions">
                            <Link className="btn small-btn" href={`/social/bots/${f._id}`}>Open editor</Link>
                            <form action={toggleFlow}><input type="hidden" name="id" value={String(f._id)} /><button className="ghost small-btn">{f.enabled ? "Turn off" : "Turn on"}</button></form>
                            <form action={deleteFlow}><input type="hidden" name="id" value={String(f._id)} /><button className="icon-link danger" title="Delete flow" aria-label={`Delete ${f.name}`}><Icon name="trash" size={15} /></button></form>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : <p className="muted small acct-empty">No flows yet. Name one above to start.</p>}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
