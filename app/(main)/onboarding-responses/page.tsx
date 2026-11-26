import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SERVICES, STEPS } from "@/lib/onboarding";
import Link from "next/link";
import { pushUnsent as pushAll, sheetTarget } from "@/lib/onboardingSheet";
import { pushUnsentNotion as pushAllNotion, briefTarget } from "@/lib/notionBrief";
import { currentUser } from "@/lib/session";
import AutoRefresh from "@/components/AutoRefresh";
import { Avatar, Icon, PageHead, ago } from "@/components/ui";

export const dynamic = "force-dynamic";

// Server actions re-check the role: the proxy blocks the page, but an action must never trust that alone.
async function pushUnsent() {
  "use server";
  if ((await currentUser())?.role !== "admin") redirect("/login");
  await pushAll();
  revalidatePath("/onboarding-responses");
}

async function pushUnsentNotion() {
  "use server";
  if ((await currentUser())?.role !== "admin") redirect("/login");
  await pushAllNotion();
  revalidatePath("/onboarding-responses");
}

const label = (id: string) => SERVICES.find((s) => s.id === id)?.label ?? id;
const isFile = (v: string) => v.split("\n").every((l) => /https:\/\/\S+$/.test(l.trim()));

export default async function Responses() {
  const { onboarding } = await db();
  const rows = await onboarding.find().sort({ at: -1 }).limit(200).toArray();
  const today = rows.filter((r) => +r.at > Date.now() - 864e5).length, unsent = rows.filter((r) => !r.sheet?.ok).length, target = await sheetTarget(), on = !!target;
  const notionUnsent = rows.filter((r) => !r.notion?.ok).length, notionTarget = await briefTarget(), notionOn = !!notionTarget;

  return (
    <>
      <AutoRefresh />
      <PageHead title="Onboarding" sub="Answers from the public onboarding form, newest first. This page refreshes by itself.">
        <a className="btn ghost" href="/onboarding" target="_blank" rel="noopener noreferrer">Open the form</a>
        <a className="btn" href="/onboarding-responses/export"><Icon name="arrow" size={16} /> Download .xlsx</a>
      </PageHead>

      <div className="grid stats">
        <div className="card stat"><div className="label"><span className="ico"><Icon name="inbox" /></span>Submissions</div><div className="value">{rows.length}</div><div className="sub">{today} in the last 24 hours</div></div>
        <div className="card stat">
          <div className="label"><span className={`ico ${on ? (unsent ? "warn" : "good") : "info"}`}><Icon name="chart" /></span>Google Sheet</div>
          <div className="value" style={{ fontSize: 22 }}>{!on ? "Not set up" : unsent ? `${unsent} not sent` : "In sync"}</div>
          <div className="sub">{!on ? <>Paste your sheet link in <Link href="/settings">Settings</Link></> : unsent ? "pushing failed or is pending" : "every answer is in the sheet"}</div>
          {on && unsent > 0 && <form action={pushUnsent} style={{ marginTop: ".6rem" }}><button className="small-btn">Push to the sheet now</button></form>}
        </div>
        <div className="card stat">
          <div className="label"><span className={`ico ${notionOn ? (notionUnsent ? "warn" : "good") : "info"}`}><Icon name="chat" /></span>Notion brief</div>
          <div className="value" style={{ fontSize: 22 }}>{!notionOn ? "Not set up" : notionUnsent ? `${notionUnsent} not sent` : "In sync"}</div>
          <div className="sub">{!notionOn ? <>Paste your page link in <Link href="/settings">Settings</Link></> : notionUnsent ? "pushing failed or is pending" : "every submission has a brief"}</div>
          {notionOn && notionUnsent > 0 && <form action={pushUnsentNotion} style={{ marginTop: ".6rem" }}><button className="small-btn">Push to Notion now</button></form>}
        </div>
      </div>

      <div className="grid" style={{ marginTop: "1rem" }}>
        {!rows.length && <div className="card empty">No submissions yet. Share the form link: <b>/onboarding</b></div>}
        {rows.map((r) => (
          <details key={String(r._id)} className="card">
            <summary style={{ cursor: "pointer", listStyle: "none" }}>
              <div className="row spread">
                <div className="who"><Avatar name={r.answers.company || r.answers.name || "?"} /><div className="two"><b>{r.answers.company || "(no company)"}</b><small>{r.answers.name} · {r.answers.email} · {ago(r.at)}</small></div></div>
                <div className="row">
                  {r.services.map((s) => <span key={s} className="chip">{label(s)}</span>)}
                  <span className={`pill ${r.sheet?.ok ? "live" : r.sheet ? "bad" : ""}`} title={r.sheet?.error}>{r.sheet?.ok ? "In sheet" : r.sheet ? "Sheet failed" : on ? "Pending" : "Not synced"}</span>
                  {r.notion?.ok ? <a className="pill live" href={r.notion.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Brief ↗</a>
                    : <span className={`pill ${r.notion ? "bad" : ""}`} title={r.notion?.error}>{r.notion ? "Brief failed" : notionOn ? "Brief pending" : "No brief"}</span>}
                </div>
              </div>
              {r.sheet?.error && <div className="small" style={{ color: "var(--bad)", marginTop: ".4rem" }}>{r.sheet.error}</div>}
              {r.notion?.error && <div className="small" style={{ color: "var(--bad)", marginTop: ".4rem" }}>{r.notion.error}</div>}
            </summary>
            <div style={{ marginTop: "1rem", display: "grid", gap: "1.2rem" }}>
              {STEPS.filter((s) => s.fields.some((f) => r.answers[f.id])).map((s) => (
                <div key={s.id}>
                  <h3>{s.title}</h3>
                  <dl style={{ margin: 0, display: "grid", gap: ".7rem" }}>
                    {s.fields.filter((f) => r.answers[f.id]).map((f) => (
                      <div key={f.id}>
                        <dt className="small muted">{f.label}</dt>
                        <dd style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                          {f.type === "file" && isFile(r.answers[f.id]) ? r.answers[f.id].split("\n").map((l) => { const u = l.trim().match(/https:\/\/\S+$/)![0]; return <div key={l}><a href={u} target="_blank" rel="noopener noreferrer">{l.replace(/\s*[—-]\s*https:\/\/\S+$/, "") || u}</a></div>; }) : r.answers[f.id]}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
