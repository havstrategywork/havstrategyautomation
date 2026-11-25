import Link from "next/link";
import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { threads } from "@/lib/threads";
import { Avatar, Badge, PageHead, ago } from "@/components/ui";

export const dynamic = "force-dynamic";

async function resolve(f: FormData) {
  "use server";
  const { creators } = await db();
  await creators.updateOne({ _id: new ObjectId(String(f.get("id"))) }, { $unset: { needsHuman: "" } }); // hands the thread back to Claude
  revalidatePath("/inbox");
}

export default async function Inbox() {
  const all = (await threads(6)).sort((a, b) => +b.last.at - +a.last.at);
  const needs = all.filter((t) => t.creator.needsHuman);
  const rest = all.filter((t) => !t.creator.needsHuman);

  const Thread = ({ t }: { t: (typeof all)[number] }) => (
    <div className="card">
      <div className="row spread">
        <div className="who"><Avatar name={t.creator.name} /><div className="two"><Link href={`/creators/${t.creator._id}`}><b>{t.creator.name}</b></Link><small>{t.creator.igHandle && `@${t.creator.igHandle}`}</small></div></div>
        <div className="row"><span className="chip soft">{t.creator.needsHuman ? "Waiting on you" : t.last.direction === "in" ? "Awaiting Claude" : "Awaiting creator"}</span><Badge s={t.creator.status ?? "New"} />{t.creator.quotedRate && <span className="chip soft">quoted {t.creator.quotedRate}</span>}</div>
      </div>
      <div className="hist" style={{ marginTop: ".75rem" }}>
        {t.thread.map((m) => (
          <div key={String(m._id)} style={m.direction === "in" ? { borderColor: "var(--accent)" } : undefined}>
            <div className="small muted">{m.direction === "in" ? "Creator" : m.by === "human" ? "You (human)" : "Claude"} · {ago(m.at)}{m.direction === "out" && m.status !== "sent" ? ` · ${m.status}` : ""}{m.price ? ` · offered ${m.price}` : ""}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
          </div>
        ))}
      </div>
      {t.creator.needsHuman && (
        <div className="row spread" style={{ marginTop: ".9rem" }}>
          <div className="notice" style={{ margin: 0, flex: 1 }}><b>Why Claude stopped:</b> {t.creator.needsHuman.reason}</div>
          <form action={resolve}><input type="hidden" name="id" value={String(t.creator._id)} /><button className="ghost" style={{ background: "var(--surface)", color: "var(--text)", borderColor: "var(--border)" }}>Resolve, hand back to Claude</button></form>
        </div>
      )}
    </div>
  );

  return (
    <>
      <PageHead title="Inbox" sub="Conversations with creators. Claude replies on its own until it hits something it shouldn't decide, then it stops here." />
      <h2>Needs you ({needs.length})</h2>
      <div className="grid">{needs.map((t) => <Thread key={String(t.creator._id)} t={t} />)}{!needs.length && <div className="card empty">Nothing needs you right now.</div>}</div>
      <h2 style={{ marginTop: "1.5rem" }}>Other conversations ({rest.length})</h2>
      <div className="grid">{rest.map((t) => <Thread key={String(t.creator._id)} t={t} />)}{!rest.length && <div className="card empty">No conversations yet. They appear when a creator replies.</div>}</div>
    </>
  );
}
