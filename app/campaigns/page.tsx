import Link from "next/link";
import { db, type BriefDoc } from "@/lib/db";
import { mine } from "@/lib/briefs";
import { money, tierRange } from "@/lib/brief";
import { tierOf } from "@/lib/fields";
import { Avatar, Badge, PageHead, Score, ago } from "@/components/ui";
import { approveBrief, archiveBrief, findMore } from "./actions";

export const dynamic = "force-dynamic";

const LABEL: Record<BriefDoc["status"], string> = {
  new: "Waiting for Cowork", shortlisting: "Cowork is finding creators", awaiting_approval: "Needs your approval",
  approved: "Approved, sending", failed: "Cowork couldn't finish", archived: "Archived",
};

export default async function Campaigns({ searchParams }: { searchParams: Promise<{ err?: string; all?: string }> }) {
  const { err, all } = await searchParams;
  const { briefs, creators, clients } = await db();
  const list = await briefs.find({ ...mine(), ...(all ? {} : { status: { $ne: "archived" } }) }).sort({ updatedAt: -1 }).limit(50).toArray();
  const ids = list.flatMap((b) => b.shortlist.map((s) => s.creatorId));
  const people = new Map((await creators.find({ _id: { $in: ids } }).toArray()).map((c) => [String(c._id), c]));
  const cls = new Map((await clients.find({ _id: { $in: list.flatMap((b) => (b.clientId ? [b.clientId] : [])) } }).toArray()).map((c) => [String(c._id), c]));
  const order = (s: BriefDoc["status"]) => (s === "awaiting_approval" ? 0 : s === "failed" ? 1 : 2);
  list.sort((a, z) => order(a.status) - order(z.status));

  return (
    <>
      <PageHead title="Campaigns" sub="Briefs from the New brief chat. Cowork finds creators; you approve; the DMs go out on schedule.">
        <Link className="btn ghost" href={all ? "/campaigns" : "/campaigns?all=1"}>{all ? "Hide archived" : "Show archived"}</Link>
      </PageHead>
      {err && <div className="notice" role="alert" style={{ borderLeftColor: "var(--bad)" }}>{err}</div>}
      {!list.length && <div className="card empty">No campaigns yet. Click <b>✦ New brief</b> (bottom right) to start one.</div>}

      {list.map((b) => {
        const cl = b.clientId ? cls.get(String(b.clientId)) : undefined;
        const pending = b.shortlist.filter((s) => !s.decision);
        const approved = b.shortlist.filter((s) => s.decision === "approved");
        const count = (tier: string, xs: typeof b.shortlist) => xs.filter((s) => (s.tier || tierOf(people.get(String(s.creatorId))?.followers ?? 0)) === tier).length;
        return (
          <section key={String(b._id)} className="card campaign">
            <div className="row spread">
              <div><h2 style={{ margin: 0 }}>{b.client}</h2><div className="small muted">{b.products.map((p) => p.name).join(" · ")} · started {ago(b.createdAt)}{b.runs ? ` · ${b.runs} Cowork run${b.runs === 1 ? "" : "s"}` : ""}</div></div>
              <Badge s={b.status}>{LABEL[b.status]}</Badge>
            </div>
            {b.note && <p className="small" style={{ margin: ".75rem 0 0" }}>{b.note}</p>}

            <div className="tablewrap" style={{ marginTop: "1rem" }}>
              <table>
                <thead><tr><th>Creator type</th><th className="num">Need</th><th className="num">Budget each</th><th className="num">Waiting for you</th><th className="num">Approved</th></tr></thead>
                <tbody>{b.rows.map((r) => (
                  <tr key={r.tier}><td>{r.tier} <span className="muted small">({tierRange(r.tier)})</span></td><td className="num">{r.count}</td><td className="num">{money(r.budget, b.currency)}</td><td className="num">{count(r.tier, pending)}</td><td className="num">{count(r.tier, approved)}</td></tr>
                ))}</tbody>
              </table>
            </div>

            {b.status === "awaiting_approval" && (
              <form action={approveBrief} className="form" style={{ marginTop: "1.25rem" }}>
                <input type="hidden" name="id" value={String(b._id)} />
                <h3 style={{ margin: 0 }}>Shortlist: untick anyone you don&apos;t want contacted</h3>
                <div className="tablewrap">
                  <table>
                    <thead><tr><th style={{ width: 40 }} /><th>Creator</th><th className="num">Followers</th><th>Type</th><th className="num">Fit</th><th>Why</th></tr></thead>
                    <tbody>{pending.map((s) => {
                      const c = people.get(String(s.creatorId));
                      return (
                        <tr key={String(s.creatorId)}>
                          <td><input type="checkbox" name="pick" value={String(s.creatorId)} defaultChecked aria-label={`Contact ${c?.name ?? "creator"}`} /></td>
                          <td><div className="who"><Avatar name={c?.name ?? "?"} /><div className="two"><Link href={`/creators/${s.creatorId}`}><b>{c?.name ?? "Unknown"}</b></Link>{c?.igHandle && <small><a href={`https://www.instagram.com/${c.igHandle}/`} target="_blank" rel="noreferrer noopener">@{c.igHandle} ↗</a></small>}</div></div></td>
                          <td className="num">{c?.followers ? c.followers.toLocaleString("en-US") : "—"}</td>
                          <td><span className="badge tier">{s.tier || tierOf(c?.followers ?? 0)}</span></td>
                          <td className="num">{s.score != null ? <Score n={Math.round(s.score)} /> : "—"}</td>
                          <td className="small muted">{s.why ?? c?.notes?.slice(0, 120) ?? ""}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
                <div className="f2">
                  <label>Message to send (word for word; {"{{name}}"} = their name)
                    <textarea name="dmTemplate" rows={7} required defaultValue={cl?.dmTemplate || b.message || b.draftMessage || ""} />
                    {!cl?.dmTemplate && !b.message && b.draftMessage && <span className="small">Drafted by Cowork: edit it as you like.</span>}
                  </label>
                  <label>Follow-up if they don&apos;t reply in 3 days (optional, sent once)
                    <textarea name="followUp" rows={7} defaultValue={cl?.followUpTemplate ?? b.followUp ?? ""} placeholder="Leave empty for no follow-up" />
                  </label>
                </div>
                <div className="row spread">
                  <div className="row">
                    <button formAction={findMore} className="ghost">Find more instead</button>
                    <button formAction={archiveBrief} className="ghost">Archive</button>
                  </div>
                  <button>Approve ticked &amp; queue DMs</button>
                </div>
              </form>
            )}

            {b.status !== "awaiting_approval" && b.status !== "archived" && (
              <form className="row" style={{ marginTop: "1rem", justifyContent: "flex-end" }}>
                <input type="hidden" name="id" value={String(b._id)} />
                {(b.status === "approved" || b.status === "failed") && <button formAction={findMore} className="ghost">Find more creators</button>}
                <button formAction={archiveBrief} className="ghost">Archive</button>
              </form>
            )}
          </section>
        );
      })}
    </>
  );
}
