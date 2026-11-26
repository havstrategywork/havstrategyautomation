"use client";
// Kanban view of the planner. Drag a draft onto Scheduled (it gets its date, or tomorrow 10:00 if it has none) or a scheduled post back onto Drafts.
// Every change goes through the server actions in app/(main)/social/planner/actions.ts, which talk to Buffer; the page refreshes after.
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { movePost, removePost, reschedulePost, type Result } from "@/app/(main)/social/planner/actions";
import { DateField } from "@/components/mui/DateField";
import { Avatar, Icon } from "@/components/ui";
import { Toast } from "@/components/PlannerComposer";

export type PlannerCard = { id: string; channel: string; service: string; text: string; img?: string; status: string; when?: string; date?: string; time?: string; error?: string; url?: string };
export type PlannerColumn = { key: string; title: string; hint: string; cards: PlannerCard[]; drop?: "draft" | "scheduled" };

const DRAGGABLE = new Set(["draft", "scheduled"]);

export default function PlannerBoard({ columns }: { columns: PlannerColumn[] }) {
  const router = useRouter();
  const [over, setOver] = useState<string | null>(null), [dragging, setDragging] = useState(false), [msg, setMsg] = useState<Result | null>(null), [busy, start] = useTransition();
  const run = (f: () => Promise<Result>) => start(async () => { const r = await f(); setMsg(r); if (r.ok) router.refresh(); });
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 4500); return () => clearTimeout(t); }, [msg]);

  return (
    <>
      <div className={`kanban${busy ? " busy" : ""}${dragging ? " dragging" : ""}`}>
        {columns.map((col) => (
          <section
            key={col.key} className={`kcol s-${col.key}${over === col.key ? " over" : ""}${col.drop ? " droppable" : ""}`} aria-label={col.title}
            onDragOver={col.drop ? (e) => { e.preventDefault(); setOver(col.key); } : undefined}
            onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
            onDrop={col.drop ? (e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) run(() => movePost(id, col.drop!)); } : undefined}
          >
            <header>
              <div><b>{col.title}</b><small>{col.hint}</small></div>
              <span className="count">{col.cards.length}</span>
            </header>
            <div className="kcol-body">
              {col.cards.map((c) => (
                <article key={c.id} className="kcard" draggable={DRAGGABLE.has(c.status)} onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); setDragging(true); }} onDragEnd={() => setDragging(false)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.img && <img className="kcard-img" src={c.img} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                  <p className="kcard-text">{c.text || <span className="muted">(no caption)</span>}</p>
                  <div className="kcard-meta">
                    <span className="kcard-ch"><Avatar name={c.channel || "?"} />{c.channel}</span>
                    {c.when && <span className="kcard-when"><Icon name="clock" size={12} />{c.when}</span>}
                  </div>
                  {c.status === "sending" && <span className="small muted">Sending…</span>}
                  {c.error && <p className="kcard-err"><Icon name="alert" size={13} />{c.error}</p>}
                  <div className="kcard-actions">
                    {c.status === "draft" && <button className="ghost small-btn" disabled={busy} onClick={() => run(() => movePost(c.id, "scheduled"))}>Schedule</button>}
                    {c.status === "scheduled" && <button className="ghost small-btn" disabled={busy} onClick={() => run(() => movePost(c.id, "draft"))}>To draft</button>}
                    {c.url && <a className="icon-link" href={c.url} target="_blank" rel="noopener noreferrer" title="Open in Buffer / on the network" aria-label="Open"><Icon name="external" size={15} /></a>}
                    {["draft", "scheduled", "needs_approval", "error"].includes(c.status) && <button className="icon-link danger" title="Delete from Buffer" aria-label="Delete" disabled={busy} onClick={() => { if (confirm("Delete this post from Buffer?")) run(() => removePost(c.id)); }}><Icon name="trash" size={15} /></button>}
                  </div>
                  {(c.status === "draft" || c.status === "scheduled") && (
                    <details className="resched">
                      <summary><Icon name="calendar" size={13} /> {c.date ? "Change date" : "Set a date"}</summary>
                      <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => reschedulePost(c.id, String(f.get("date") ?? ""), String(f.get("time") ?? ""))); }}>
                        <DateField name="date" label="Date" defaultValue={c.date} />
                        <label className="lbl"><span>Time (India)</span><input type="time" name="time" defaultValue={c.time ?? "10:00"} required /></label>
                        <button className="small-btn" disabled={busy}>Save</button>
                      </form>
                    </details>
                  )}
                </article>
              ))}
              {!col.cards.length && <div className="kempty">{col.drop ? "Drop a post here" : "Nothing here"}</div>}
            </div>
          </section>
        ))}
      </div>
      <Toast msg={msg} />
    </>
  );
}
