import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { listCreators, upsertCreator } from "@/lib/queries";
import { parseCsv } from "@/lib/csv";
import { STATUSES, TIERS, tierOf } from "@/lib/fields";
import { Avatar, Badge, PageHead, Score } from "@/components/ui";

export const dynamic = "force-dynamic";

async function importCsv(f: FormData) {
  "use server";
  const file = f.get("file") as File;
  if (!file?.size) redirect("/creators?msg=" + encodeURIComponent("Choose a CSV file first"));
  const { clients } = await db();
  const byName = new Map((await clients.find().toArray()).map((c) => [c.name.toLowerCase(), c._id]));
  let ok = 0;
  const notes: string[] = [];
  try {
    for (const [i, r] of parseCsv(await file.text()).entries()) {
      notes.push(...r.warnings);
      const ids = r.suggestedNames.flatMap((n) => byName.get(n.toLowerCase()) ?? (notes.push(`row ${i + 2}: no client named "${n}"`), []));
      try { await upsertCreator({ ...r.payload, ...(ids.length && { suggestedVia: ids }) }); ok++; }
      catch (e) { notes.push(`row ${i + 2}: ${(e as Error).message}`); }
    }
  } catch (e) { notes.push((e as Error).message); }
  redirect("/creators?msg=" + encodeURIComponent(`Imported ${ok}. ${notes.length ? `${notes.length} issue(s): ` + notes.slice(0, 6).join("; ") : ""}`));
}

const Yes = ({ on, label }: { on: boolean; label: string }) => <span className={on ? "ok" : "no"} title={on ? `${label} available` : `No ${label}`}>{on ? "●" : "○"} {label}</span>;

export default async function Creators({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { clients } = await db();
  const [clientList, rows] = await Promise.all([
    clients.find().toArray(),
    listCreators({ clientId: sp.clientId, niche: sp.niche, q: sp.q, minScore: Number(sp.minScore || 0), status: sp.status, tier: sp.tier }),
  ]);
  const clientName = new Map(clientList.map((c) => [String(c._id), c.name]));
  const withClient = rows.length > 0 && rows[0].score !== null;
  const activeClient = clientList.find((c) => String(c._id) === sp.clientId);

  return (
    <>
      <PageHead title="Creators" sub={`${rows.length} shown${activeClient ? ` · ranked for ${activeClient.name}` : ""}`}>
        <a className="btn ghost" href="/creators/export">Export CSV</a>
      </PageHead>
      {sp.msg && <div className="notice">{sp.msg}</div>}

      <form className="card filters">
        <label>Rank for client
          <select name="clientId" defaultValue={sp.clientId ?? ""}>
            <option value="">No client</option>
            {clientList.map((c) => <option key={String(c._id)} value={String(c._id)}>{c.name}</option>)}
          </select>
        </label>
        <label>Status<select name="status" defaultValue={sp.status ?? ""}><option value="">Any</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Tier<select name="tier" defaultValue={sp.tier ?? ""}><option value="">Any</option>{TIERS.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Niche<input name="niche" defaultValue={sp.niche} placeholder="fitness" /></label>
        <label>Search<input name="q" defaultValue={sp.q} placeholder="name, @handle, bio" /></label>
        <label>Min score<input name="minScore" type="number" defaultValue={sp.minScore} /></label>
        <div className="row"><button>Apply</button><Link href="/creators" className="btn ghost">Reset</Link></div>
      </form>

      <details className="card" style={{ marginTop: "1rem" }}>
        <summary>Import creators from CSV</summary>
        <form action={importCsv} className="row end" style={{ marginTop: ".75rem" }}>
          <label style={{ flex: "1 1 260px" }}>CSV file (same columns as the sheet; re-importing updates existing creators)<input name="file" type="file" accept=".csv,text/csv" /></label>
          <button>Import</button>
        </form>
      </details>

      <div className="tablewrap" style={{ marginTop: "1rem" }}>
        <table>
          <thead><tr>{withClient && <th>Fit</th>}<th>Creator</th><th className="num">Followers</th><th>Category / location</th><th>Reach</th><th>Status</th><th>DM sent</th><th className="num">Suggested</th><th className="num">Quoted / agreed</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={String(c._id)}>
                {withClient && <td><Score n={c.score!} /></td>}
                <td><div className="who"><Avatar name={c.name} /><div className="two"><Link href={`/creators/${c._id}`}><b>{c.name}</b></Link><small>{c.igHandle ? `@${c.igHandle}` : "no handle"}</small></div></div></td>
                <td className="num">{c.followers ? c.followers.toLocaleString() : "—"} <Badge s="tier">{tierOf(c.followers)}</Badge></td>
                <td><div className="two">{c.igCategory ?? <span className="muted">—</span>}<small>{c.location}</small></div></td>
                <td><div className="two"><Yes on={!!c.igHandle} label="IG" /><small><Yes on={!!c.email} label="Email" /></small></div></td>
                <td><Badge s={c.status ?? "New"} /></td>
                <td className="muted">{c.dmSentAt ? new Date(c.dmSentAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}</td>
                <td className="num" title={(c.suggestedVia ?? []).map((i) => clientName.get(String(i))).join(", ")}>{c.suggestedVia?.length ?? 0}×</td>
                <td className="num">{c.quotedRate ?? "—"} / {c.agreedRate ?? "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9}><div className="empty">No creators match these filters.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
