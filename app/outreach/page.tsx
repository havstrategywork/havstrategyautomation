import Link from "next/link";
import { db } from "@/lib/db";
import { Avatar, Badge, PageHead, Pagination, ago } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Outreach({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { outreach, creators } = await db();
  const filter = { channel: "ig" as const, ...(sp.status && { status: sp.status as "queued" | "sent" | "failed" }) };

  const PAGE_SIZE = 15;
  const total = await outreach.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, Number(sp.page) || 1), totalPages);

  const rows = await outreach
    .find(filter)
    .sort({ createdAt: -1 })
    .skip((currentPage - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .toArray();

  const byId = new Map((await creators.find({ _id: { $in: rows.map((r) => r.creatorId) } }).toArray()).map((c) => [String(c._id), c]));
  const tab = (label: string, q: Record<string, string>) => {
    const on = (q.status ?? "") === (sp.status ?? "");
    return <Link key={label} className={`btn ${on ? "" : "ghost"}`} href={`/outreach?${new URLSearchParams(q)}`}>{label}</Link>;
  };

  return (
    <>
      <PageHead
        title="Outreach"
        sub={`Instagram DMs, sent by Claude via Chrome (see CLAUDE.md) · ${total} message${total === 1 ? "" : "s"}${totalPages > 1 ? ` · Page ${currentPage} of ${totalPages}` : ""}`}
      />
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
            {!total && <tr><td colSpan={4}><div className="empty">Nothing here yet.</div></td></tr>}
          </tbody>
        </table>
      </div>

      <Pagination page={currentPage} total={total} pageSize={PAGE_SIZE} basePath="/outreach" params={sp} itemLabel="messages" />
    </>
  );
}
