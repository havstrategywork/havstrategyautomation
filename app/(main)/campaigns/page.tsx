import Link from "next/link";
import { ObjectId } from "mongodb";
import { db, type BriefDoc } from "@/lib/db";
import { mine } from "@/lib/briefs";
import { money, tierRange } from "@/lib/brief";
import { tierOf } from "@/lib/fields";
import { Avatar, Badge, PageHead, Pagination, Score, ago } from "@/components/ui";
import { daysRemaining, readyDeals } from "@/lib/deals";
import Funnel, { type FunnelStage } from "@/components/Funnel";
import {
  approveBrief, archiveBrief, createSheetAction, findMore, markSharedAction,
  saveDeadlineAction, saveGuidelinesAction, saveScriptReminderAction,
  sendDeadlineAction, sendGuidelinesAction, sendScriptReminderAction, uploadAnswersAction,
} from "./actions";

export const dynamic = "force-dynamic";

const LABEL: Record<BriefDoc["status"], string> = {
  new: "Waiting for Cowork", shortlisting: "Cowork is finding creators", awaiting_approval: "Needs your approval (no saved message)",
  approved: "Approved, sending", failed: "Cowork couldn't finish", archived: "Archived",
};

export default async function Campaigns({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string; all?: string; page?: string }> }) {
  const { err, ok, all, page: pageParam } = await searchParams;
  const { briefs, creators, clients, dealBatches, outreach } = await db();

  // The campaign-stage funnel: creator -> outreach -> negotiate -> client's approval -> guideline email (M1)
  // -> script reminder (M2) -> deadline email (M3). Each button drills into the creators (or, for M3, campaigns) behind it.
  const [
    nCreatorsAll, creatorsFunnelList, outreachSentCount, outreachFunnelList,
    negotiatingCount, negotiatingList, approvalCount, approvalList,
    m1Count, m1List, m2Count, m2List, deadlineClients, deadlineSentByClient,
  ] = await Promise.all([
    creators.countDocuments(),
    creators.find().sort({ createdAt: -1 }).limit(20).project<{ _id: unknown; name: string; igHandle?: string; followers: number; status?: string }>({ name: 1, igHandle: 1, followers: 1, status: 1 }).toArray(),
    outreach.countDocuments({ channel: "ig", status: "sent" }),
    outreach.find({ channel: "ig", status: "sent" }).sort({ sentAt: -1 }).limit(20).toArray(),
    creators.countDocuments({ status: "Negotiating" }),
    creators.find({ status: "Negotiating" }).sort({ lastChecked: -1 }).limit(20).project<{ _id: unknown; name: string; igHandle?: string; quotedRate?: string }>({ name: 1, igHandle: 1, quotedRate: 1 }).toArray(),
    creators.countDocuments({ clientDecision: { $exists: true } }),
    creators.find({ clientDecision: { $exists: true } }).sort({ decidedAt: -1 }).limit(20).project<{ _id: unknown; name: string; igHandle?: string; clientDecision?: string; clientNote?: string }>({ name: 1, igHandle: 1, clientDecision: 1, clientNote: 1 }).toArray(),
    creators.countDocuments({ guidelinesSentAt: { $exists: true } }),
    creators.find({ guidelinesSentAt: { $exists: true } }).sort({ guidelinesSentAt: -1 }).limit(20).project<{ _id: unknown; name: string; igHandle?: string; guidelinesSentAt?: Date }>({ name: 1, igHandle: 1, guidelinesSentAt: 1 }).toArray(),
    creators.countDocuments({ scriptReminderSentAt: { $exists: true } }),
    creators.find({ scriptReminderSentAt: { $exists: true } }).sort({ scriptReminderSentAt: -1 }).limit(20).project<{ _id: unknown; name: string; igHandle?: string; scriptReminderSentAt?: Date }>({ name: 1, igHandle: 1, scriptReminderSentAt: 1 }).toArray(),
    clients.find({ contentDeadline: { $exists: true, $ne: "" } }).project<{ _id: unknown; name: string; contentDeadline?: string }>({ name: 1, contentDeadline: 1 }).limit(20).toArray(),
    creators.aggregate<{ _id: unknown; n: number }>([{ $match: { deadlineSentAt: { $exists: true } } }, { $group: { _id: "$dealClientId", n: { $sum: 1 } } }]).toArray(),
  ]);
  const outreachPeople = new Map((await creators.find({ _id: { $in: outreachFunnelList.map((o) => o.creatorId) } }).project<{ _id: unknown; name: string; igHandle?: string }>({ name: 1, igHandle: 1 }).toArray()).map((p) => [String(p._id), p]));
  const deadlineSentMap = new Map(deadlineSentByClient.map((r) => [String(r._id), r.n]));

  const campaignStages: FunnelStage[] = [
    { key: "creator", label: "Creator", icon: "users", count: nCreatorsAll, emptyText: "No creators yet.", items: creatorsFunnelList.map((p) => ({ id: String(p._id), title: p.name, meta: p.igHandle ? `@${p.igHandle} · ${p.followers.toLocaleString("en-IN")} followers` : undefined, right: p.status ?? "New", href: `/creators/${p._id}` })) },
    { key: "outreach", label: "Outreach", icon: "send", count: outreachSentCount, emptyText: "No outreach sent yet.", items: outreachFunnelList.map((o) => { const p = outreachPeople.get(String(o.creatorId)); return { id: String(o._id), title: p?.name ?? "Unknown", meta: p?.igHandle ? `@${p.igHandle}` : undefined, right: ago(o.sentAt), href: p ? `/creators/${o.creatorId}` : undefined }; }) },
    { key: "negotiate", label: "Negotiate", icon: "chat", count: negotiatingCount, emptyText: "Nobody's negotiating right now.", items: negotiatingList.map((p) => ({ id: String(p._id), title: p.name, meta: p.igHandle ? `@${p.igHandle}` : undefined, right: p.quotedRate, href: `/creators/${p._id}` })) },
    { key: "approval", label: "Client's approval", icon: "check", count: approvalCount, emptyText: "No creators reviewed by a client yet.", items: approvalList.map((p) => ({ id: String(p._id), title: p.name, meta: p.igHandle ? `@${p.igHandle}` : undefined, right: p.clientDecision === "yes" ? "Yes" : "No", href: `/creators/${p._id}` })) },
    { key: "m1", label: "Guideline email · M1", icon: "inbox", count: m1Count, emptyText: "No guideline emails sent yet.", items: m1List.map((p) => ({ id: String(p._id), title: p.name, meta: p.igHandle ? `@${p.igHandle}` : undefined, right: ago(p.guidelinesSentAt), href: `/creators/${p._id}` })) },
    { key: "m2", label: "Script reminder · M2", icon: "bolt", count: m2Count, emptyText: "No script reminders sent yet.", items: m2List.map((p) => ({ id: String(p._id), title: p.name, meta: p.igHandle ? `@${p.igHandle}` : undefined, right: ago(p.scriptReminderSentAt), href: `/creators/${p._id}` })) },
    {
      key: "m3", label: "Deadline email · M3", icon: "alert", count: deadlineClients.length, emptyText: "No campaign has a content deadline set yet.",
      items: deadlineClients.map((cl) => {
        const days = daysRemaining(cl.contentDeadline);
        return { id: String(cl._id), title: cl.name, meta: `${deadlineSentMap.get(String(cl._id)) ?? 0} reminder email${(deadlineSentMap.get(String(cl._id)) ?? 0) === 1 ? "" : "s"} sent`, right: days == null ? "—" : days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d left`, href: "/campaigns" };
      }),
    },
  ];

  // Client review: agreed deals waiting for a sheet, and the sheets already sent (last 60 days) with the client's answers.
  const waiting = await readyDeals();
  const batches = await dealBatches.find({ createdAt: { $gte: new Date(Date.now() - 60 * 864e5) } }).sort({ createdAt: -1 }).toArray();
  const onSheet = await creators.find({ batchId: { $in: batches.map((b) => b._id!) } }).toArray();
  const reviewClients = [...new Set([...waiting.keys(), ...batches.map((b) => String(b.clientId))])];
  const reviewNames = new Map((await clients.find({ _id: { $in: reviewClients.map((i) => new ObjectId(i)) } }).toArray()).map((c) => [String(c._id), c]));
  const query = { ...mine(), ...(all ? {} : { status: { $ne: "archived" as const } }) };

  const PAGE_SIZE = 15;
  const total = await briefs.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, Number(pageParam) || 1), totalPages);

  const list = await briefs
    .find(query)
    .sort({ updatedAt: -1 })
    .skip((currentPage - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .toArray();
  const ids = list.flatMap((b) => b.shortlist.map((s) => s.creatorId));
  const people = new Map((await creators.find({ _id: { $in: ids } }).toArray()).map((c) => [String(c._id), c]));
  const cls = new Map((await clients.find({ _id: { $in: list.flatMap((b) => (b.clientId ? [b.clientId] : [])) } }).toArray()).map((c) => [String(c._id), c]));
  const order = (s: BriefDoc["status"]) => (s === "awaiting_approval" ? 0 : s === "failed" ? 1 : 2);
  list.sort((a, z) => order(a.status) - order(z.status));

  return (
    <>
      <PageHead
        title="Campaigns"
        sub={`Briefs from the New brief chat. Cowork finds creators; with a saved message they're approved automatically, otherwise you approve; the DMs go out on schedule.${total > 0 ? ` · ${total} campaign${total === 1 ? "" : "s"}` : ""}${totalPages > 1 ? ` · Page ${currentPage} of ${totalPages}` : ""}`}
      >
        <Link className="btn ghost" href={all ? "/campaigns" : "/campaigns?all=1"}>{all ? "Hide archived" : "Show archived"}</Link>
      </PageHead>
      {err && <div className="notice" role="alert" style={{ borderLeftColor: "var(--bad)" }}>{err}</div>}
      {ok && <div className="notice" role="status">{ok}</div>}

      <Funnel stages={campaignStages} />

      {reviewClients.map((cid) => {
        const cl = reviewNames.get(cid);
        const mineBatches = batches.filter((b) => String(b.clientId) === cid);
        const rows = onSheet.filter((c) => String(c.dealClientId) === cid);
        const toSend = rows.filter((c) => c.clientDecision === "yes" && !c.guidelinesSentAt).length;
        const toSendScript = rows.filter((c) => c.guidelinesSentAt && !c.scriptReminderSentAt).length;
        const toSendDeadline = rows.filter((c) => c.guidelinesSentAt && !c.deadlineSentAt).length;
        const days = daysRemaining(cl?.contentDeadline);
        const n = waiting.get(cid)?.length ?? 0;
        return (
          <section key={cid} className="card campaign">
            <div className="row spread">
              <div><h2 style={{ margin: 0 }}>{cl?.name ?? "Client"}: client review</h2><div className="small muted">Create the sheet, review it, give it to the client yourself, then upload the file they send back (.xlsx or .csv). Yes = guidelines email.</div></div>
              {n > 0 && <form action={createSheetAction}><input type="hidden" name="id" value={cid} /><button>Create sheet for {n} agreed creator{n === 1 ? "" : "s"}</button></form>}
            </div>
            {mineBatches.map((b) => (
              <div key={String(b._id)} className="row spread" style={{ margin: ".75rem 0 0", alignItems: "flex-start" }}>
                <p className="small" style={{ margin: 0 }}>
                  <b>{b.answeredAt ? "Answers uploaded" : b.sharedAt ? "With the client" : "Review it, then give it to the client"}</b> · sheet from {ago(b.createdAt)} · {b.creatorIds.length} creators · <a href={b.url} target="_blank" rel="noreferrer noopener">open sheet{b.tab ? ` (tab: ${b.tab})` : ""}</a>
                  {b.sharedAt && <> · given {ago(b.sharedAt)}</>}{b.answeredAt && <> · answers {ago(b.answeredAt)}</>}
                </p>
                <form className="row" action={uploadAnswersAction} encType="multipart/form-data">
                  <input type="hidden" name="id" value={String(b._id)} />
                  {!b.sharedAt && !b.answeredAt && <button formAction={markSharedAction} className="ghost small-btn">Mark given to client</button>}
                  <input type="file" name="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Client's returned sheet (.xlsx or .csv)" />
                  <button className="small-btn">{b.answeredAt ? "Upload corrected answers" : "Upload client's answers"}</button>
                </form>
              </div>
            ))}
            {rows.length > 0 && (
              <div className="tablewrap" style={{ marginTop: "1rem" }}>
                <table>
                  <thead><tr><th>Creator</th><th className="num">Agreed rate</th><th>Client says</th><th>Note</th><th>M1 Guidelines</th><th>M2 Script</th><th>M3 Deadline</th></tr></thead>
                  <tbody>{rows.map((c) => (
                    <tr key={String(c._id)}>
                      <td><Link href={`/creators/${c._id}`}><b>{c.igHandle ? `@${c.igHandle}` : c.name}</b></Link></td>
                      <td className="num">{c.agreedRate}</td>
                      <td>{c.clientDecision === "yes" ? "Yes" : c.clientDecision === "no" ? "No" : "Waiting"}</td>
                      <td className="small muted">{c.clientNote}</td>
                      <td className="small">{c.guidelinesSentAt ? `Sent ${ago(c.guidelinesSentAt)}` : c.clientDecision === "yes" ? (c.email ? "Ready" : "No email on file") : ""}</td>
                      <td className="small">{c.scriptReminderSentAt ? `Sent ${ago(c.scriptReminderSentAt)}` : c.guidelinesSentAt ? "Ready" : ""}</td>
                      <td className="small">{c.deadlineSentAt ? `Sent ${ago(c.deadlineSentAt)}` : c.guidelinesSentAt ? "Ready" : ""}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <form className="form" style={{ marginTop: "1rem" }}>
              <input type="hidden" name="id" value={cid} />
              <label>Guidelines email for creators the client approves (first line: Subject: ...; {"{{name}}"} {"{{handle}}"} {"{{rate}}"} are filled in)
                <textarea name="guidelines" rows={8} defaultValue={cl?.guidelinesTemplate ?? ""} placeholder={"Subject: Our collab guidelines, [Brand] x @{{handle}}\n\nHi {{name}}, ..."} />
              </label>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button formAction={saveGuidelinesAction} className="ghost">Save email</button>
                {toSend > 0 && <button formAction={sendGuidelinesAction}>Send guidelines to {toSend} approved creator{toSend === 1 ? "" : "s"}</button>}
              </div>
            </form>

            <form className="form" style={{ marginTop: "1rem" }}>
              <input type="hidden" name="id" value={cid} />
              <label>Script reminder email · M2, sent once guidelines have gone out (first line: Subject: ...; {"{{name}}"} {"{{handle}}"} {"{{rate}}"} are filled in)
                <textarea name="scriptReminder" rows={5} defaultValue={cl?.scriptReminderTemplate ?? ""} placeholder={"Subject: Script check-in, [Brand] x @{{handle}}\n\nHi {{name}}, just checking in on your script..."} />
              </label>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button formAction={saveScriptReminderAction} className="ghost">Save email</button>
                {toSendScript > 0 && <button formAction={sendScriptReminderAction}>Send reminder to {toSendScript} creator{toSendScript === 1 ? "" : "s"}</button>}
              </div>
            </form>

            <form className="form" style={{ marginTop: "1rem" }}>
              <input type="hidden" name="id" value={cid} />
              <div className="f2">
                <label>Content deadline for this campaign
                  <input type="date" name="contentDeadline" defaultValue={cl?.contentDeadline ?? ""} />
                  <span className="small muted">{days == null ? "Not set." : days < 0 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue.` : days === 0 ? "Due today." : `${days} day${days === 1 ? "" : "s"} remaining.`}</span>
                </label>
                <label>Deadline email · M3 (same placeholders, plus {"{{days}}"} = days remaining)
                  <textarea name="deadline" rows={5} defaultValue={cl?.deadlineTemplate ?? ""} placeholder={"Subject: {{days}} days left to submit, @{{handle}}\n\nHi {{name}}, just a reminder..."} />
                </label>
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button formAction={saveDeadlineAction} className="ghost">Save</button>
                {toSendDeadline > 0 && <button formAction={sendDeadlineAction} disabled={days == null}>Send deadline reminder to {toSendDeadline} creator{toSendDeadline === 1 ? "" : "s"}</button>}
              </div>
            </form>
          </section>
        );
      })}
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
                    <textarea name="followUp" rows={7} defaultValue={cl?.followUpTemplate ?? b.followUp ?? ""} placeholder="Leave empty to use the standard 4 follow-ups (day 1, 2, 5, 10). Or write your own, separated by a line with ---. Type none for no follow-ups." />
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

      <Pagination page={currentPage} total={total} pageSize={PAGE_SIZE} basePath="/campaigns" params={{ ...(err && { err }), ...(all && { all }) }} itemLabel="campaigns" />
    </>
  );
}
