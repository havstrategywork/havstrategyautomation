import Link from "next/link";
import { db } from "@/lib/db";
import { MAILBOXES, STATUS_LABEL, type Mailbox, type MailStatus } from "@/lib/mail";
import { Avatar, Badge, Icon, PageHead, Pagination, ago } from "@/components/ui";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 15;
const FILTERS: [string, string, MailStatus[]][] = [
  ["all", "All", []], ["negotiating", "Negotiating", ["negotiating"]], ["follow_up", "Follow-ups", ["follow_up"]], ["closed", "Closed", ["closed"]],
  ["founder_review", "Founder review", ["founder_review"]], ["other", "Other", ["awaiting_sender", "draft", "forward_draft", "no_action", "lost"]],
];
const inboxUrl = (mailbox: string, url?: string) => url ?? MAILBOXES[mailbox as Mailbox]?.url;

export default async function Mail({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { mailThreads, mailRuns } = await db();
  const f = FILTERS.find(([k]) => k === sp.show) ?? FILTERS[0];
  const box = sp.box && sp.box in MAILBOXES ? sp.box : "";
  const filter = { ...(f[2].length && { status: { $in: f[2] } }), ...(box && { mailbox: box }) };

  const [byStatus, followUps, closed, last, total] = await Promise.all([
    mailThreads.aggregate<{ _id: MailStatus; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
    mailThreads.aggregate<{ n: number; threads: number }>([{ $group: { _id: null, n: { $sum: "$followUps" }, threads: { $sum: { $cond: [{ $gt: ["$followUps", 0] }, 1, 0] } } } }]).toArray(),
    mailThreads.find({ status: "closed" }).sort({ updatedAt: -1 }).limit(50).toArray(),
    mailRuns.find().sort({ at: -1 }).limit(1).next(),
    mailThreads.countDocuments(filter),
  ]);
  const n = (s: MailStatus) => byStatus.find((x) => x._id === s)?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), page = Math.min(Math.max(1, Number(sp.page) || 1), pages);
  const rows = await mailThreads.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).toArray();
  const stale = !last || Date.now() - +last.at > 6 * 3600e3;
  const href = (show: string, b: string) => `/mail?${new URLSearchParams({ show, ...(b && { box: b }) })}`;

  return (
    <>
      <PageHead title="Email" sub="What the email agent is doing in the two Hostinger mailboxes: negotiations, follow-ups and closed deals.">
        {(Object.entries(MAILBOXES) as [Mailbox, (typeof MAILBOXES)[Mailbox]][]).map(([k, b]) => (
          <a key={k} className="btn ghost" href={b.url} target="_blank" rel="noopener noreferrer"><Icon name="inbox" size={16} /> {b.label}</a>
        ))}
      </PageHead>

      <div className="grid stats">
        <div className="card stat">
          <div className="label"><span className="ico warn"><Icon name="chat" /></span>Negotiating</div>
          <div className="value">{n("negotiating")}</div>
          <div className="sub">{n("awaiting_sender")} waiting on the sender</div>
        </div>
        <div className="card stat">
          <div className="label"><span className="ico info"><Icon name="send" /></span>Follow-ups sent</div>
          <div className="value">{followUps[0]?.n ?? 0}</div>
          <div className="sub">across {followUps[0]?.threads ?? 0} conversation{followUps[0]?.threads === 1 ? "" : "s"} · {n("follow_up")} pending</div>
        </div>
        <div className="card stat">
          <div className="label"><span className="ico good"><Icon name="handshake" /></span>Closed</div>
          <div className="value">{n("closed")}</div>
          <div className="sub">deals agreed, founder confirms</div>
        </div>
        <div className="card stat">
          <div className="label"><span className={`ico ${n("founder_review") ? "warn" : "info"}`}><Icon name="alert" /></span>Founder review</div>
          <div className="value" style={n("founder_review") ? { color: "var(--warn)" } : undefined}>{n("founder_review")}</div>
          <div className="sub">{n("draft")} drafts · {n("forward_draft")} BD/HR forwards waiting</div>
        </div>
        <div className="card stat">
          <div className="label"><span className={`ico ${stale ? "warn" : "good"}`}><Icon name="pulse" /></span>Last run</div>
          <div className="value" style={{ fontSize: 18 }}>{last ? ago(last.at) : "never"}</div>
          <div className="sub">{last ? (last.ok ? "ok" : "failed") + (last.note ? `: ${last.note.slice(0, 90)}` : "") : "waiting for the agent's first report"}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <div className="row spread"><h2 style={{ margin: 0 }}>Closed deals ({closed.length})</h2><span className="small muted">Sender email, so you can find the thread</span></div>
        {closed.length ? (
          <ul className="feed" style={{ marginTop: ".5rem" }}>
            {closed.map((t) => (
              <li key={String(t._id)}>
                <Avatar name={t.name ?? t.email} />
                <div className="two"><b>{t.email}</b><small>{t.subject}{t.price ? ` · ${t.price}` : ""} · {MAILBOXES[t.mailbox as Mailbox]?.label ?? t.mailbox}</small></div>
                <a className="btn ghost small-btn" style={{ marginLeft: "auto" }} href={inboxUrl(t.mailbox, t.url)} target="_blank" rel="noopener noreferrer">Open in Hostinger</a>
                <span className="t" style={{ marginLeft: 0 }}>{ago(t.updatedAt)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted small" style={{ margin: ".5rem 0 0" }}>No closed deals yet.</p>}
      </div>

      <div className="row" style={{ margin: "1.5rem 0 1rem" }}>
        {FILTERS.map(([k, label]) => <Link key={k} className={`btn ${k === f[0] ? "" : "ghost"}`} href={href(k, box)}>{label}</Link>)}
        <span style={{ flex: 1 }} />
        {["", ...Object.keys(MAILBOXES)].map((k) => <Link key={k} className={`btn ${k === box ? "" : "ghost"}`} href={href(f[0], k)}>{k ? `${k}@` : "Both"}</Link>)}
      </div>

      <div className="tablewrap">
        <table>
          <thead><tr><th>Sender</th><th>Mailbox</th><th>Category</th><th>Status</th><th>Price</th><th title="Follow-ups we sent">Follow-ups</th><th>Updated</th><th /></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={String(t._id)}>
                <td><div className="who"><Avatar name={t.name ?? t.email} /><div className="two"><b>{t.name ?? t.email}</b><small>{t.name ? `${t.email} · ` : ""}{t.subject.slice(0, 60)}</small></div></div></td>
                <td className="muted">{t.mailbox}@</td>
                <td>{t.category ? <span className="chip soft">{t.category}</span> : <span className="muted">—</span>}</td>
                <td><Badge s={t.status}>{STATUS_LABEL[t.status] ?? t.status}</Badge>{t.note && <div className="small muted" style={{ maxWidth: 260 }}>{t.note}</div>}</td>
                <td>{t.price ?? <span className="muted">—</span>}</td>
                <td className={t.followUps ? "" : "muted"}>{t.followUps}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{ago(t.updatedAt)}</td>
                <td><a className="btn ghost small-btn" href={inboxUrl(t.mailbox, t.url)} target="_blank" rel="noopener noreferrer">Open</a></td>
              </tr>
            ))}
            {!total && <tr><td colSpan={8}><div className="empty">Nothing here yet. The agent reports after each run.</div></td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath="/mail" params={sp} itemLabel="conversations" />
    </>
  );
}
