import Link from "next/link";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Avatar, Icon, PageHead } from "@/components/ui";

export const dynamic = "force-dynamic";

// Pick an org, then any of its Instagram accounts (default: all of them). The report for each selected account is the next build step.
export default async function Reports({ searchParams }: { searchParams: Promise<{ org?: string; acc?: string | string[] }> }) {
  const sp = await searchParams;
  const { orgs, socialAccounts } = await db();
  const [list, me] = await Promise.all([orgs.find().sort({ name: 1 }).toArray(), currentUser()]);
  const org = list.find((o) => String(o._id) === sp.org) ?? list[0];
  const accounts = org ? await socialAccounts.find({ orgId: org._id as ObjectId }).sort({ igHandle: 1 }).toArray() : [];
  const picked = [sp.acc ?? []].flat();
  const chosen = picked.length && !picked.includes("all") ? accounts.filter((a) => picked.includes(String(a._id))) : accounts; // nothing picked (or "all") = every account
  const on = new Set(chosen.map((a) => String(a._id)));

  return (
    <>
      <PageHead title="Reports" sub="Instagram performance from Metricool, one column per account." />

      {!list.length ? (
        <div className="card empty">No organizations yet.{me?.role === "admin" && <> <Link href="/social/orgs">Add one</Link>.</>}</div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: "1rem" }}>
            {list.map((o) => <Link key={String(o._id)} className={`btn ${o._id === org._id ? "" : "ghost"}`} href={`/social/reports?org=${o._id}`}>{o.name}</Link>)}
          </div>

          {accounts.length ? (
            <form className="card form" method="get" action="/social/reports">
              <input type="hidden" name="org" value={String(org._id)} />
              <div className="row spread">
                <h2 style={{ margin: 0 }}>Instagram accounts <span className="muted small">({chosen.length} of {accounts.length} selected)</span></h2>
                <Link className="small" href={`/social/reports?org=${org._id}&acc=all`}>Select all</Link>
              </div>
              <div className="row">
                {accounts.map((a) => (
                  <label key={String(a._id)} className="row" style={{ gap: ".5rem", flexWrap: "nowrap", padding: ".4rem .7rem", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer", background: "var(--surface)" }}>
                    <input type="checkbox" name="acc" value={String(a._id)} defaultChecked={on.has(String(a._id))} style={{ width: "auto" }} />
                    <Avatar name={a.igHandle} /><span className="two"><b>@{a.igHandle}</b><small>{a.brand}</small></span>
                  </label>
                ))}
              </div>
              <div><button>Show report</button></div>
            </form>
          ) : (
            <div className="card empty">{org.name} has no Instagram accounts yet.{me?.role === "admin" ? <> Sync them on the <Link href="/social/orgs">Organizations</Link> page.</> : " Ask an admin to sync them."}</div>
          )}

          {chosen.length > 0 && (
            <div className="grid cols" style={{ marginTop: "1rem" }}>
              {chosen.map((a) => (
                <div key={String(a._id)} className="card">
                  <div className="who"><Avatar name={a.igHandle} /><div className="two"><b>@{a.igHandle}</b><small>{a.brand}</small></div></div>
                  <p className="muted small" style={{ margin: ".8rem 0 0" }}><Icon name="pulse" size={14} /> Report data (growth, reach, top content, audience) is the next step.</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
