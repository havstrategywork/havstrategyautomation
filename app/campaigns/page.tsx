import Link from "next/link";
import { ObjectId } from "mongodb";
import { db, type BriefDoc } from "@/lib/db";
import { money, tierRange } from "@/lib/brief";
import { tierOf } from "@/lib/fields";
import { Avatar, Badge, PageHead, Pagination, Score, ago } from "@/components/ui";
import BriefChat from "@/components/BriefChat";
import { readyDeals } from "@/lib/deals";
import { approveBrief, archiveBrief, createLocalBatchAction, createSheetAction, deleteBrief, findMore, markSharedAction, saveFollowEmailsAction, saveGuidelinesAction, sendDeadlineAction, sendGuidelinesAction, sendScriptReminderAction, uploadAnswersAction } from "./actions";
import { daysLabel, daysLeft } from "@/lib/dealrules";
import { DeleteCampaignButton } from "./DeleteCampaignButton";
import { GuidelinesUpload } from "./GuidelinesUpload";

export const dynamic = "force-dynamic";

const LABEL: Record<BriefDoc["status"], string> = {
  new: "Waiting for Cowork", shortlisting: "Cowork is finding creators", awaiting_approval: "Needs your approval (no saved message)",
  approved: "Approved, sending", failed: "Cowork couldn't finish", archived: "Archived",
};

export default async function Campaigns({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string; all?: string; page?: string }> }) {
  const { err, ok, all, page: pageParam } = await searchParams;
  const { briefs, creators, clients, dealBatches } = await db();

  // Client review: agreed deals waiting for a sheet, and the sheets already sent (last 60 days) with the client's answers.
  const waiting = await readyDeals();
  const batches = await dealBatches.find({ createdAt: { $gte: new Date(Date.now() - 60 * 864e5) } }).sort({ createdAt: -1 }).toArray();
  const onSheet = await creators.find({ batchId: { $in: batches.map((b) => b._id!) } }).toArray();
  const reviewClients = [...new Set([...waiting.keys(), ...batches.map((b) => String(b.clientId))])];
  const reviewNames = new Map((await clients.find({ _id: { $in: reviewClients.map((i) => new ObjectId(i)) } }).toArray()).map((c) => [String(c._id), c]));
  const query = all ? {} : { status: { $ne: "archived" as const } };

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

      {reviewClients.map((cid) => {
        const cl = reviewNames.get(cid);
        const mineBatches = batches.filter((b) => String(b.clientId) === cid);
        const rows = onSheet.filter((c) => String(c.dealClientId) === cid);
        const toSend = rows.filter((c) => c.clientDecision === "yes" && !c.guidelinesSentAt).length;
        // after the guidelines: script reminder (once each) and the deadline email (at most once a day each)
        const briefed = rows.filter((c) => c.clientDecision === "yes" && c.guidelinesSentAt);
        const dayAgo = Date.now() - 20 * 3600_000;
        const toScript = briefed.filter((c) => !c.scriptReminderSentAt).length;
        const toDeadline = briefed.filter((c) => !c.deadlineEmailAt || new Date(c.deadlineEmailAt).getTime() < dayAgo).length;
        const left = daysLeft(cl?.contentDeadline);
        const tone = left === null ? "" : left < 0 ? "bad" : left <= 2 ? "warn" : "good";
        const n = waiting.get(cid)?.length ?? 0;
        return (
          <section key={cid} className="card campaign">
            <div className="row spread">
              <div><h2 style={{ margin: 0 }}>{cl?.name ?? "Client"}: client review</h2><div className="small muted">{cl?.sheetUrl ? "Create the sheet, review it, give it to the client yourself, then upload the file they send back (.xlsx or .csv). Yes = guidelines email." : "No Google Sheet on file for this client: download the review as a plain .xlsx instead, review it, give it to the client yourself, then upload the file they send back."}</div></div>
              {n > 0 && (
                <form action={cl?.sheetUrl ? createSheetAction : createLocalBatchAction}>
                  <input type="hidden" name="id" value={cid} />
                  <button>{cl?.sheetUrl ? `Create sheet for ${n} agreed creator${n === 1 ? "" : "s"}` : `Get .xlsx for ${n} agreed creator${n === 1 ? "" : "s"}`}</button>
                </form>
              )}
            </div>
            {mineBatches.map((b) => (
              <div key={String(b._id)} className="row spread" style={{ margin: ".75rem 0 0", alignItems: "flex-start" }}>
                <p className="small" style={{ margin: 0 }}>
                  <b>{b.answeredAt ? "Answers uploaded" : b.sharedAt ? "With the client" : "Review it, then give it to the client"}</b> · sheet from {ago(b.createdAt)} · {b.creatorIds.length} creators ·{" "}
                  {b.url && <><a href={b.url} target="_blank" rel="noreferrer noopener">open sheet{b.tab ? ` (tab: ${b.tab})` : ""}</a> · </>}
                  <a href={`/campaigns/sheet/${b._id}`}>Download .xlsx</a>
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
                  <thead><tr><th>Creator</th><th className="num">Agreed rate</th><th>Client says</th><th>Note</th><th>Guidelines</th><th>Script reminder</th><th>Deadline email</th></tr></thead>
                  <tbody>{rows.map((c) => (
                    <tr key={String(c._id)}>
                      <td><Link href={`/creators/${c._id}`}><b>{c.igHandle ? `@${c.igHandle}` : c.name}</b></Link></td>
                      <td className="num">{c.agreedRate}</td>
                      <td>{c.clientDecision === "yes" ? "Yes" : c.clientDecision === "no" ? "No" : "Waiting"}</td>
                      <td className="small muted">{c.clientNote}</td>
                      <td className="small">{c.guidelinesSentAt ? `Sent ${ago(c.guidelinesSentAt)}` : c.clientDecision === "yes" ? (c.email ? "Ready" : "No email on file") : ""}</td>
                      <td className="small">{c.scriptReminderSentAt ? `Sent ${ago(c.scriptReminderSentAt)}` : c.guidelinesSentAt ? "Ready" : ""}</td>
                      <td className="small">{c.deadlineEmailAt ? `Sent ${ago(c.deadlineEmailAt)}` : c.guidelinesSentAt ? "Ready" : ""}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {toSend > 0 && (
              <form className="row" style={{ marginTop: "1rem", justifyContent: "flex-end" }}>
                <input type="hidden" name="id" value={cid} />
                <button formAction={sendGuidelinesAction}>Send guidelines to {toSend} approved creator{toSend === 1 ? "" : "s"}</button>
              </form>
            )}

            <form className="form follow-emails" style={{ marginTop: "1rem" }}>
              <input type="hidden" name="id" value={cid} />
              <div className="row spread">
                <b>After the guidelines</b>
                <label className="row deadline-pick">Content deadline
                  <input type="date" name="contentDeadline" defaultValue={cl?.contentDeadline ?? ""} />
                  {left !== null && <span className={`days-pill ${tone}`}>{daysLabel(left)}</span>}
                </label>
              </div>
              <label>Script reminder email (first line: Subject: ...; {"{{name}}"} {"{{handle}}"} {"{{rate}}"} {"{{deadline}}"} {"{{days}}"} are filled in)
                <textarea name="script" rows={6} defaultValue={cl?.scriptReminderTemplate ?? ""} placeholder={"Subject: Reminder: your script for [Brand] x @{{handle}}\n\nHi {{name}}, a quick reminder to share your script with us for approval. Content is due on {{deadline}} ({{days}} to go)."} />
              </label>
              <label>Deadline email (sent as the date gets closer; can go once a day)
                <textarea name="deadlineEmail" rows={6} defaultValue={cl?.deadlineTemplate ?? ""} placeholder={"Subject: {{days}} left: [Brand] x @{{handle}} content deadline\n\nHi {{name}}, just a heads-up that your content is due on {{deadline}}, {{days}} from today."} />
              </label>
              <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button formAction={saveFollowEmailsAction} className="ghost">Save emails</button>
                <button formAction={sendScriptReminderAction} disabled={!toScript || !cl?.scriptReminderTemplate}
                  title={!briefed.length ? "Send the guidelines first" : !cl?.scriptReminderTemplate ? "Save the script reminder email first" : !toScript ? "Everyone already got it" : undefined}>
                  Send script reminder to {toScript} creator{toScript === 1 ? "" : "s"}
                </button>
                <button formAction={sendDeadlineAction} className={`deadline-btn ${tone}`} disabled={!toDeadline || !cl?.deadlineTemplate || left === null}
                  title={!briefed.length ? "Send the guidelines first" : left === null ? "Set the content deadline first" : !cl?.deadlineTemplate ? "Save the deadline email first" : !toDeadline ? "Everyone got it in the last day" : undefined}>
                  Send deadline email{left !== null ? ` · ${daysLabel(left)}` : ""} ({toDeadline})
                </button>
              </div>
            </form>
          </section>
        );
      })}
      {!list.length && <div className="card empty">No campaigns yet to see here. Click <b>✦ New brief</b> (bottom right) to start one.</div>}

      {list.map((b) => {
        const cl = b.clientId ? cls.get(String(b.clientId)) : undefined;
        const pending = b.shortlist.filter((s) => !s.decision);
        const approved = b.shortlist.filter((s) => s.decision === "approved");
        const count = (tier: string, xs: typeof b.shortlist) => xs.filter((s) => (s.tier || tierOf(people.get(String(s.creatorId))?.followers ?? 0)) === tier).length;
        return (
          <section key={String(b._id)} className="card campaign">
            <div className="row spread">
              <div><h2 style={{ margin: 0 }}>{b.client}</h2><div className="small muted">{b.products.map((p) => p.name).join(" · ")} · started {ago(b.createdAt)}{b.runs ? ` · ${b.runs} Cowork run${b.runs === 1 ? "" : "s"}` : ""}</div></div>
              <div className="row" style={{ gap: ".5rem" }}>
                {b.shortlist.length > 0 && <a className="btn ghost small-btn" href={`/campaigns/export/${b._id}`}>Export .csv</a>}
                {b.status !== "archived" && (
                  <BriefChat edit={{ id: String(b._id), data: { step: 0, client: b.client, products: b.products.length ? b.products : [{ name: "", about: "" }], rows: b.rows.length ? b.rows : [{ tier: "Micro", count: 2, budget: 10000 }], currency: b.currency, other: b.other, message: b.message, followUp: b.followUp, sheetUrl: b.sheetUrl ?? "" } }} />
                )}
                <Badge s={b.status}>{LABEL[b.status]}</Badge>
              </div>
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
                <h3 style={{ margin: 0 }}>Shortlist: untick anyone you don&apos;t want the outreach to be sent.</h3>
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
            {b.status === "archived" && <DeleteCampaignButton action={deleteBrief} id={String(b._id)} />}
            {cl && (
              <form className="form" style={{ marginTop: "1rem" }}>
                <input type="hidden" name="id" value={String(cl._id)} />
                <label>Email to creators the client approves (first line: Subject: ...; {"{{name}}"} {"{{handle}}"} {"{{rate}}"} {"{{brand}}"} are filled in)
                  <textarea name="guidelines" rows={8} defaultValue={cl.guidelinesTemplate ?? ""} placeholder={"Subject: Our collab guidelines, [Brand] x @{{handle}}\n\nHi {{name}}, ..."} />
                </label>
                <label>Terms doc (Google Doc with {"{{name}}"}/{"{{brand}}"} placeholders; merged and attached as a personalized PDF per creator)
                  <input type="url" name="termsDocUrl" placeholder="https://docs.google.com/document/d/…" defaultValue={cl.termsDocId ? `https://docs.google.com/document/d/${cl.termsDocId}/edit` : ""} />
                </label>
                <div className="row spread" style={{ alignItems: "center" }}>
                  <div>
                    <div className="small muted">Brand guidelines/deck (PDF or PPTX, attached as-is to every creator)</div>
                    {cl.guidelinesFileName && <div className="small">Current: {cl.guidelinesFileName}</div>}
                    <GuidelinesUpload clientId={String(cl._id)} />
                  </div>
                  <button formAction={saveGuidelinesAction} className="ghost">Save guidelines</button>
                </div>
              </form>
            )}
          </section>
        );
      })}

      <Pagination page={currentPage} total={total} pageSize={PAGE_SIZE} basePath="/campaigns" params={{ ...(err && { err }), ...(all && { all }) }} itemLabel="campaigns" />
    </>
  );
}
