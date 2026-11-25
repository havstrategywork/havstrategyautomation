import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, PageHead, ago } from "@/components/ui";
import { OrgTabs } from "@/components/social";
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
      <PageHead title="Chat bots" sub="Automatic replies to Instagram DMs. Build a flow, connect its steps, then switch it on for an account." />
      {sp.m && <div className="notice" role="status">{sp.m}</div>}

      {!list.length ? (
        <div className="card empty">No organizations yet.{me?.role === "admin" && <> <Link href="/social/orgs">Add one</Link>.</>}</div>
      ) : (
        <>
          <OrgTabs orgs={list} current={String(org._id)} href={(id) => `/social/bots?org=${id}`} />

          {!conns.length && <div className="card empty">No Instagram accounts are connected for {org.name} yet.{me?.role === "admin" ? <> Connect one on the <Link href="/social/orgs">Organizations</Link> page.</> : " Ask an admin to connect them."}</div>}

          <div className="grid">
            {conns.map((c) => {
              const mine = flows.filter((f) => f.igId === c.igId);
              return (
                <div key={String(c._id)} className="card">
                  <div className="row spread">
                    <div className="who"><Avatar name={c.username ?? c.igId} /><div className="two"><b>@{c.username ?? c.igId}</b><small>{mine.filter((f) => f.enabled).length} of {mine.length} flows on{c.test ? " · test account: nothing is sent to Instagram" : ""}</small></div></div>
                    <form action={createFlow} className="row" style={{ flexWrap: "nowrap" }}>
                      <input type="hidden" name="conn" value={String(c._id)} />
                      <input name="name" placeholder="New flow name" maxLength={80} style={{ width: 200 }} />
                      <button className="small-btn">New flow</button>
                    </form>
                  </div>
                  {c.lastError && <div className="notice" style={{ margin: ".8rem 0 0", borderLeftColor: "var(--bad)" }}><b>Replies are failing</b> ({ago(c.lastError.at)}): {c.lastError.message}</div>}

                  {mine.length ? (
                    <div className="flows">
                      {mine.map((f) => {
                        const trig = f.nodes.find((n) => n.type === "trigger");
                        const kw = trig ? (trig.data as { keywords: string[] }).keywords : [];
                        return (
                          <div key={String(f._id)} className={`flow${f.enabled ? " on" : ""}`}>
                            <div className="row spread" style={{ flexWrap: "nowrap" }}>
                              <Link href={`/social/bots/${f._id}`} className="flow-name"><b>{f.name}</b></Link>
                              <span className={`pill ${f.enabled ? "live" : ""}`}><i />{f.enabled ? "Live" : "Off"}</span>
                            </div>
                            <div className="chips">{kw.length ? kw.slice(0, 5).map((k) => <span key={k} className="chip">{k}</span>) : <span className="chip soft">every message</span>}{kw.length > 5 && <span className="chip soft">+{kw.length - 5}</span>}</div>
                            <small className="muted">{f.nodes.length} steps · edited {ago(f.updatedAt)}</small>
                            <div className="row flow-actions">
                              <Link className="btn small-btn" href={`/social/bots/${f._id}`}>Edit</Link>
                              <form action={toggleFlow}><input type="hidden" name="id" value={String(f._id)} /><button className="ghost small-btn">{f.enabled ? "Turn off" : "Turn on"}</button></form>
                              <form action={deleteFlow} style={{ marginLeft: "auto" }}><input type="hidden" name="id" value={String(f._id)} /><button className="ghost small-btn" style={{ color: "var(--bad)" }}>Delete</button></form>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="muted small" style={{ margin: ".6rem 0 0" }}>No flows yet. Name one above to start.</p>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
