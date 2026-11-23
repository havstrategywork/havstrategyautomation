import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Badge, PageHead, ago } from "@/components/ui";
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
          <div className="row" style={{ marginBottom: "1rem" }}>
            {list.map((o) => <Link key={String(o._id)} className={`btn ${o._id === org._id ? "" : "ghost"}`} href={`/social/bots?org=${o._id}`}>{o.name}</Link>)}
          </div>

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
                    <ul className="feed" style={{ marginTop: ".6rem" }}>
                      {mine.map((f) => (
                        <li key={String(f._id)}>
                          <div className="two"><Link href={`/social/bots/${f._id}`}><b>{f.name}</b></Link><small>{f.nodes.length} steps · {f.nodes.find((n) => n.type === "trigger" && n.data.keywords.length) ? `triggers on ${(f.nodes.find((n) => n.type === "trigger")!.data as { keywords: string[] }).keywords.slice(0, 4).join(", ")}` : "replies to every message"} · edited {ago(f.updatedAt)}</small></div>
                          <Badge s={f.enabled ? "sent" : "queued"}>{f.enabled ? "On" : "Off"}</Badge>
                          <Link className="btn ghost small-btn" href={`/social/bots/${f._id}`}>Edit</Link>
                          <form action={toggleFlow}><input type="hidden" name="id" value={String(f._id)} /><button className="ghost small-btn">{f.enabled ? "Turn off" : "Turn on"}</button></form>
                          <form action={deleteFlow}><input type="hidden" name="id" value={String(f._id)} /><button className="ghost small-btn" style={{ color: "var(--bad)" }}>Delete</button></form>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="muted small" style={{ margin: ".6rem 0 0" }}>No flows yet.</p>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
