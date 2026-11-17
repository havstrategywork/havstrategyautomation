import Link from "next/link";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sendQueuedEmails } from "@/lib/email";
import { Avatar, Badge, PageHead, ago } from "@/components/ui";

export const dynamic = "force-dynamic";

async function sendEmails() {
  "use server";
  await sendQueuedEmails();
  revalidatePath("/outreach");
}

export default async function Outreach({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { outreach, creators } = await db();
  const filter = { ...(sp.channel && { channel: sp.channel as "ig" | "email" }), ...(sp.status && { status: sp.status as "queued" | "sent" | "failed" }) };
  const rows = await outreach.find(filter).sort({ createdAt: -1 }).limit(200).toArray();
  const byId = new Map((await creators.find({ _id: { $in: rows.map((r) => r.creatorId) } }).toArray()).map((c) => [String(c._id), c]));
  const tab = (label: string, q: Record<string, string>) => {
    const on = (q.status ?? "") === (sp.status ?? "") && (q.channel ?? "") === (sp.channel ?? "");
    return <Link key={label} className={`btn ${on ? "" : "ghost"}`} href={`/outreach?${new URLSearchParams(q)}`}>{label}</Link>;
  };

  return (
    <>
      <PageHead title="Outreach" sub="IG DMs are sent by Claude via Chrome (see CLAUDE.md). Emails go out from here through Gmail.">
        <form action={sendEmails}><button className="ghost" style={{ background: "var(--surface)", color: "var(--text)", borderColor: "var(--border)" }}>Send queued emails now</button></form>
      </PageHead>
      <div className="row" style={{ marginBottom: "1rem" }}>
        {tab("All", {})}{tab("Queued", { status: "queued" })}{tab("Sent", { status: "sent" })}{tab("Failed", { status: "failed" })}
        <span className="muted">|</span>{tab("IG", { channel: "ig" })}{tab("Email", { channel: "email" })}
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Creator</th><th>Channel</th><th>Status</th><th>When</th><th>Message</th></tr></thead>
          <tbody>
            {rows.map((o) => {
              const c = byId.get(String(o.creatorId));
              return (
                <tr key={String(o._id)}>
                  <td><div className="who"><Avatar name={c?.name ?? "?"} />{c ? <div className="two"><Link href={`/creators/${c._id}`}><b>{c.name}</b></Link><small>{c.igHandle ? `@${c.igHandle}` : c.email}</small></div> : "—"}</div></td>
                  <td><Badge s={o.channel}>{o.channel === "ig" ? "Instagram" : "Email"}</Badge></td>
                  <td><Badge s={o.status} />{o.error && <div className="small" style={{ color: "var(--bad)" }}>{o.error}</div>}</td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{ago(o.sentAt ?? o.createdAt)}</td>
                  <td><details><summary className="small">{o.message.slice(0, 70)}{o.message.length > 70 ? "…" : ""}</summary><div className="small">{o.subject && <b>{o.subject}{"\n"}</b>}{o.message}</div></details></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={5}><div className="empty">Nothing here yet.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
