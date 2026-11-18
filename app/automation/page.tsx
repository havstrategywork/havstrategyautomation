import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, IG_CAP, ownerName, sentToday } from "@/lib/db";
import { controlState } from "@/lib/control";
import { currentUser } from "@/lib/session";
import { notify } from "@/lib/notify";
import { FOLLOWUP_SCHEDULE } from "@/lib/outreach";
import { PROMPTS, SCHEDULES, type Kind } from "@/lib/prompts";
import { PageHead, ago } from "@/components/ui";
import CopyBlock from "@/components/CopyBlock";

export const dynamic = "force-dynamic";

async function testNotify() {
  "use server";
  if (!(await currentUser())) redirect("/login");
  await notify("Test from Outreach", "If you can read this, notifications work.");
  revalidatePath("/automation");
}

export default async function Automation() {
  const url = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const key = process.env.API_KEY ?? "";
  const ctl = await controlState();
  const { briefs, outreach } = await db();
  const [awaiting, newBriefs, queued, sent] = await Promise.all([
    briefs.countDocuments({ status: "awaiting_approval" }), briefs.countDocuments({ status: "new" }),
    outreach.countDocuments({ channel: "ig", status: "queued" }), sentToday("ig"),
  ]);
  const checks: [boolean, string, string][] = [
    [!!url, "APP_URL is set", url || "Set APP_URL to the hosted address (e.g. https://havstrategyautomation.vercel.app) so prompts and notifications link to it."],
    [key.length >= 16, "API_KEY is long enough", key.length >= 16 ? `${key.length} characters` : "Use a long random key (16+ characters); it is shared with Cowork."],
    [!!ownerName(), "OWNER is set", ownerName() || "Set OWNER (e.g. akshit) so you and your teammate never touch each other's creators."],
    [!process.env.IG_ALLOWLIST, "Live mode (no IG_ALLOWLIST)", process.env.IG_ALLOWLIST ? `Test mode: only ${process.env.IG_ALLOWLIST} gets messages.` : "Real creators get messages."],
    [!!process.env.NOTIFY_URL, "Notifications (NOTIFY_URL)", process.env.NOTIFY_URL ? "Configured. Use the test button below." : "Not set: you won't be pinged for pauses, escalations or shortlists."],
    [FOLLOWUP_SCHEDULE.length > 0, "Follow-ups", FOLLOWUP_SCHEDULE.length ? `Up to ${FOLLOWUP_SCHEDULE.length}, on day ${FOLLOWUP_SCHEDULE.join(", ")} after the first DM, while there is no reply (one text per step in the campaign's follow-up).` : "Off (FOLLOWUP_SCHEDULE empty)."],
  ];

  return (
    <>
      <PageHead title="Automation" sub="Everything Cowork runs on a schedule, and what it needs from you." />
      {ctl.paused && <div className="notice" style={{ borderLeftColor: "var(--bad)" }}><b>Paused:</b> {ctl.paused.reason}. Resume it from the Dashboard once Instagram is fine.</div>}

      <div className="grid stats">
        <div className="card stat"><div className="label">Worker</div><div className="value" style={{ fontSize: 18 }}>{ctl.paused ? "Paused" : ctl.run ? `Running: ${ctl.run.kind}` : "Idle"}</div><div className="sub">{ctl.lastRun ? `last: ${ctl.lastRun.kind} ${ago(ctl.lastRun.endedAt)}${ctl.lastRun.ok ? "" : " (failed)"}` : "never ran"}</div></div>
        <div className="card stat"><div className="label">Briefs</div><div className="value">{newBriefs}<span className="muted small"> new</span> · {awaiting}<span className="muted small"> to approve</span></div><div className="sub">see Campaigns</div></div>
        <div className="card stat"><div className="label">DMs today</div><div className="value">{sent}<span className="muted"> / {IG_CAP}</span></div><div className="sub">{queued} queued</div></div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <div className="row spread"><h2 style={{ margin: 0 }}>Setup checklist</h2><form action={testNotify}><button className="ghost small-btn">Send test notification</button></form></div>
        <ul className="checks">{checks.map(([ok, label, detail]) => <li key={label} className={ok ? "ok" : "todo"}><span aria-hidden="true">{ok ? "✓" : "!"}</span><div><b>{label}</b><small>{detail}</small></div></li>)}</ul>
      </div>

      <h2 style={{ margin: "1.75rem 0 .25rem" }}>Scheduled Cowork tasks</h2>
      <p className="muted small" style={{ margin: "0 0 1rem" }}>Create one scheduled task per prompt in Claude Cowork, on the computer whose Chrome is logged in to the brand&apos;s Instagram. The prompts already contain this app&apos;s address and API key; treat them like a password.</p>
      <div className="grid cols">
        {(Object.keys(SCHEDULES) as Kind[]).map((k) => (
          <div key={k} className="card form">
            <div><h2 style={{ margin: 0 }}>{SCHEDULES[k].title}</h2><div className="small" style={{ marginTop: ".2rem" }}><b>Schedule:</b> {SCHEDULES[k].when}</div><p className="small muted" style={{ margin: ".35rem 0 0" }}>{SCHEDULES[k].what}</p></div>
            <CopyBlock text={PROMPTS[k](url || "<APP_URL>", key)} />
          </div>
        ))}
      </div>
    </>
  );
}
