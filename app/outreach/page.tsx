import Link from "next/link";
import { db } from "@/lib/db";
import { Avatar, Badge, PageHead, ago } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Outreach({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { outreach, creators } = await db();
  const filter = { channel: "ig" as const, ...(sp.status && { status: sp.status as "queued" | "sent" | "failed" }) };
  const rows = await outreach.find(filter).sort({ createdAt: -1 }).limit(200).toArray();
  const byId = new Map((await creators.find({ _id: { $in: rows.map((r) => r.creatorId) } }).toArray()).map((c) => [String(c._id), c]));
  const tab = (label: string, q: Record<string, string>) => {
    const on = (q.status ?? "") === (sp.status ?? "");
    return <Link key={label} className={`btn ${on ? "" : "ghost"}`} href={`/outreach?${new URLSearchParams(q)}`}>{label}</Link>;
  };

  return (
    <>
      <PageHead title="Outreach" sub="Instagram DMs, sent by Claude via Chrome (see CLAUDE.md)." />
      <div className="row" style={{ marginBottom: "1rem" }}>
        {tab("All", {})}{tab("Queued", { status: "queued" })}{tab("Sent", { status: "sent" })}{tab("Failed", { status: "failed" })}
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Creator</th><th>Status</th><th>When</th><th>Message</th></tr></thead>
          <tbody>
            {rows.map((o) => {
              const c = byId.get(String(o.creatorId));
              return (
                <tr key={String(o._id)}>
                  <td><div className="who"><Avatar name={c?.name ?? "?"} />{c ? <div className="two"><Link href={`/creators/${c._id}`}><b>{c.name}</b></Link><small>{c.igHandle ? `@${c.igHandle}` : c.email}</small></div> : "—"}</div></td>
                  <td><Badge s={o.status} />{o.error && <div className="small" style={{ color: "var(--bad)" }}>{o.error}</div>}</td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{ago(o.sentAt ?? o.createdAt)}</td>
                  <td><details><summary className="small">{o.message.slice(0, 70)}{o.message.length > 70 ? "…" : ""}</summary><div className="small">{o.message}</div></details></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={4}><div className="empty">Nothing here yet.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
