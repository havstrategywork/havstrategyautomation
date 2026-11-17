import Link from "next/link";
import { db, EMAIL_CAP, IG_CAP, sentToday } from "@/lib/db";
import { STATUSES } from "@/lib/fields";
import { revalidatePath } from "next/cache";
import { controlState } from "@/lib/control";
import { Badge, PageHead, ago } from "@/components/ui";

export const dynamic = "force-dynamic";

const COLORS: Record<string, string> = { New: "#9aa3b2", "DM Sent": "#3b82f6", Replied: "#8b5cf6", Negotiating: "#f59e0b", Agreed: "#22c55e", Declined: "#ef4444" };

async function resume() {
  "use server";
  await (await db()).control.updateOne({ _id: "state" }, { $unset: { paused: "" } });
  revalidatePath("/");
}

export default async function Dashboard() {
  const ctl = await controlState();
  const lastEnd = ctl.lastRun ? +new Date(ctl.lastRun.endedAt) : 0;
  const stale = !ctl.lastRun || Date.now() - lastEnd > 60 * 60 * 1000;
  const { creators, clients, outreach } = await db();
  const [needsYou, nCreators, nClients, igQueued, emailQueued, ig, email, byStatus, recent, names] = await Promise.all([
    creators.countDocuments({ needsHuman: { $exists: true } }), creators.countDocuments(), clients.countDocuments(),
    outreach.countDocuments({ channel: "ig", status: "queued" }), outreach.countDocuments({ channel: "email", status: "queued" }),
    sentToday("ig"), sentToday("email"),
    creators.aggregate<{ _id: string; n: number }>([{ $group: { _id: { $ifNull: ["$status", "New"] }, n: { $sum: 1 } } }]).toArray(),
    outreach.find().sort({ createdAt: -1 }).limit(8).toArray(),
    creators.find({}, { projection: { name: 1 } }).toArray(),
  ]);
  const count = new Map(byStatus.map((s) => [s._id, s.n]));
  const nameOf = new Map(names.map((c) => [String(c._id), c.name]));
  const Bar = ({ v, max }: { v: number; max: number }) => <div className="bar"><i style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /></div>;

  return (
    <>
      <PageHead title="Dashboard" sub="Today's outreach and where your creators sit in the pipeline." />
      {ctl.paused && (
        <div className="notice" style={{ borderLeftColor: "var(--bad)", display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
          <div><b>Automation is paused.</b> {ctl.paused.reason} <span className="muted">({ago(ctl.paused.at)})</span><div className="small muted">No DMs or replies will be handed out until you resume. Check the Instagram account first.</div></div>
          <form action={resume}><button>Resume</button></form>
        </div>
      )}
      <div className="grid stats">
        <div className="card stat"><div className="label">Instagram DMs today</div><div className="value">{ig}<span className="muted"> / {IG_CAP}</span></div><Bar v={ig} max={IG_CAP} /><div className="sub" style={{ marginTop: ".4rem" }}>{igQueued} queued</div></div>
        <div className="card stat"><div className="label">Emails today</div><div className="value">{email}<span className="muted"> / {EMAIL_CAP}</span></div><Bar v={email} max={EMAIL_CAP} /><div className="sub" style={{ marginTop: ".4rem" }}>{emailQueued} queued</div></div>
        <div className="card stat"><div className="label">Worker</div><div className="value" style={{ fontSize: 18, color: ctl.paused ? "var(--bad)" : stale ? "var(--warn)" : "var(--good)" }}>{ctl.paused ? "Paused" : ctl.run ? `Running ${ctl.run.kind}` : stale ? "No recent run" : "Healthy"}</div><div className="sub">{ctl.lastRun ? `last: ${ctl.lastRun.kind} ${ago(ctl.lastRun.endedAt)}${ctl.lastRun.ok ? "" : " (failed)"}` : "never ran"}{ctl.lastRun?.note ? ` · ${ctl.lastRun.note}` : ""}</div></div>
        <Link href="/inbox" className="card stat" style={{ color: "inherit" }}><div className="label">Needs you</div><div className="value" style={needsYou ? { color: "var(--warn)" } : undefined}>{needsYou}</div><div className="sub">conversations escalated by Claude</div></Link>
        <Link href="/creators" className="card stat" style={{ color: "inherit" }}><div className="label">Creators</div><div className="value">{nCreators}</div><div className="sub">in the database</div></Link>
        <Link href="/clients" className="card stat" style={{ color: "inherit" }}><div className="label">Clients</div><div className="value">{nClients}</div><div className="sub">active requirements</div></Link>
      </div>

      <div className="grid cols" style={{ marginTop: "1rem" }}>
        <div className="card">
          <h2>Pipeline</h2>
          {nCreators ? (
            <>
              <div className="pipeline">{STATUSES.map((s) => <i key={s} title={`${s}: ${count.get(s) ?? 0}`} style={{ width: `${((count.get(s) ?? 0) / nCreators) * 100}%`, background: COLORS[s] }} />)}</div>
              <div className="legend">{STATUSES.map((s) => <Link key={s} href={`/creators?status=${encodeURIComponent(s)}`} style={{ color: "inherit" }}><span style={{ ["--c" as string]: COLORS[s] }}>{s} <b>{count.get(s) ?? 0}</b></span></Link>)}</div>
            </>
          ) : <div className="empty">No creators yet. Import a CSV or ask Claude to hunt.</div>}
        </div>
        <div className="card">
          <div className="row spread"><h2>Recent outreach</h2><Link href="/outreach" className="small">View all</Link></div>
          {recent.length ? (
            <ul className="feed">{recent.map((o) => (
              <li key={String(o._id)}><Badge s={o.channel}>{o.channel === "ig" ? "IG" : "Email"}</Badge><span>{nameOf.get(String(o.creatorId))}</span><Badge s={o.status} /><span className="t">{ago(o.sentAt ?? o.createdAt)}</span></li>
            ))}</ul>
          ) : <div className="empty">Nothing queued yet.</div>}
        </div>
      </div>
    </>
  );
}
