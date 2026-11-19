"use client";
// Scripted "chat" that collects a campaign brief one question at a time and submits it to the automation
// (Campaigns page; Cowork's scheduled "briefs" run picks it up). No AI runs here: the questions are fixed.
// A copy-paste Cowork prompt is still offered as a manual fallback. The draft is kept in localStorage.
import { useEffect, useRef, useState } from "react";
import { TIERS } from "@/lib/fields";
import Link from "next/link";
import { buildPrompt, cleanRows, money, sheetIdFromUrl, tierRange, type Brief, type Row } from "@/lib/brief";
import { editBriefAction, submitBriefAction } from "@/app/campaigns/actions";

const KEY = "briefDraft";
type Draft = Brief & { step: number; followUp: string; sheetUrl: string; sent?: string };
const blank = (): Draft => ({ step: 0, client: "", products: [{ name: "", about: "" }], rows: [{ tier: "Micro", count: 2, budget: 10000 }], currency: "INR", other: "", message: "", followUp: "", sheetUrl: "" });
const CURRENCIES = ["INR", "AED", "USD", "EUR", "GBP"];
const Q = [
  "Hi! Let's put together a campaign brief. What's the client or brand name?",
  "Which products are we promoting? Add each one, with a line about it if it helps.",
  "What creators do you need? Add a row per tier: how many, and the most you'd pay each.",
  "Any other requirements? Location, niche, audience, deliverables, timeline, brands to avoid…",
  "Paste the outreach message to send, word for word. Skip it and Cowork will draft one for your approval.",
  "Follow-ups go out on day 1, 2, 5 and 10 if a creator doesn't reply. Write your own (one per step), or skip to use the standard ones.",
  "Do you have the client's Google Sheet link? When creators are agreed, we add a new \"Content creators\" tab to it (share it with edit access first). Skip and we'll make a fresh sheet.",
];

export default function BriefChat({ appUrl = "", apiKey = "", edit }: { appUrl?: string; apiKey?: string; edit?: { id: string; data: Draft } }) {
  const [open, setOpen] = useState(!!edit);
  const [b, setB] = useState<Draft>(() => (edit ? { ...edit.data, step: Q.length } : blank()));
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!edit) try { const s = localStorage.getItem(KEY); if (s) setB({ ...blank(), ...JSON.parse(s) }); } catch {} }, [edit]);
  useEffect(() => { if (!edit) try { localStorage.setItem(KEY, JSON.stringify(b)); } catch {} }, [b, edit]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [b.step, open]);

  const set = (p: Partial<typeof b>) => setB((x) => ({ ...x, ...p }));
  const setRow = (i: number, p: Partial<Row>) => set({ rows: b.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const products = b.products.filter((p) => p.name.trim());
  const rows = cleanRows(b.rows);
  const ok = [b.client.trim() !== "", products.length > 0, rows.length > 0 && rows.length === b.rows.length, true, true, true, !b.sheetUrl.trim() || sheetIdFromUrl(b.sheetUrl) !== null][b.step] ?? true;
  const next = () => ok && set({ step: b.step + 1 });

  const answer = (i: number) => [
    b.client,
    products.map((p) => p.name).join(", "),
    rows.map((r) => `${r.count} × ${r.tier} at up to ${money(r.budget, b.currency)}`).join(" · "),
    b.other.trim() || "None",
    b.message.trim() ? `“${b.message.trim().slice(0, 90)}${b.message.trim().length > 90 ? "…" : ""}”` : "Skipped, Cowork will draft one",
    b.followUp.trim() ? `“${b.followUp.trim().slice(0, 90)}${b.followUp.trim().length > 90 ? "…" : ""}”` : "Standard 4 follow-ups (day 1, 2, 5, 10)",
    b.sheetUrl.trim() ? "New “Content creators” tab in their sheet" : "Skipped, we'll make a fresh sheet",
  ][i];
  const submit = async () => {
    setBusy(true); setErr("");
    const r = edit
      ? await editBriefAction(edit.id, b).catch((e) => ({ ok: false as const, error: String(e?.message ?? e) }))
      : await submitBriefAction(b).catch((e) => ({ ok: false as const, error: String(e?.message ?? e) }));
    setBusy(false);
    if (r.ok) set({ sent: "ok" }); else setErr(r.error);
  };
  const prompt = b.step >= Q.length ? buildPrompt(b, appUrl || (typeof location === "undefined" ? "" : location.origin), apiKey) : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt); } catch { (document.getElementById("brief-out") as HTMLTextAreaElement | null)?.select(); document.execCommand?.("copy"); }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };
  const used = (i: number) => new Set(b.rows.filter((_, j) => j !== i).map((r) => r.tier));

  return (
    <>
      {!open && (edit
        ? <button className="ghost small-btn" onClick={() => setOpen(true)}>Edit details</button>
        : <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Open campaign brief chat"><Spark /> New brief</button>)}
      {open && (
        <section className="chat-panel" role="dialog" aria-label="Campaign brief">
          <header className="chat-head">
            <div className="row" style={{ gap: ".55rem" }}><span className="chat-dot"><Spark /></span><div><b>{edit ? "Edit campaign details" : "Campaign brief"}</b><small>{edit ? "Saved straight to this campaign" : "Sent to the automation when you're done"}</small></div></div>
            <div className="row" style={{ gap: ".3rem" }}>
              {!edit && <button className="icon-btn" title="Start over" aria-label="Start over" onClick={() => { setB(blank()); setCopied(false); setErr(""); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></svg></button>}
              <button className="icon-btn" title="Close" aria-label="Close" onClick={() => setOpen(false)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
          </header>

          <div className="chat-body">
            {Q.slice(0, Math.min(b.step, Q.length)).map((q, i) => (
              <div key={i} className="chat-pair">
                <div className="bubble bot">{q}</div>
                <button className="bubble me" title="Edit this answer" onClick={() => set({ step: i })}>{answer(i)}</button>
              </div>
            ))}

            {b.step < Q.length && <div className="bubble bot">{Q[b.step]}</div>}

            {b.step === 0 && (
              <input autoFocus placeholder="e.g. Nuume" value={b.client} maxLength={80} onChange={(e) => set({ client: e.target.value })} onKeyDown={(e) => e.key === "Enter" && next()} />
            )}

            {b.step === 1 && (
              <div className="chat-card">
                {b.products.map((p, i) => (
                  <div key={i} className="prod-row">
                    <input placeholder={`Product ${i + 1}`} value={p.name} maxLength={80} onChange={(e) => set({ products: b.products.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                    <input placeholder="What it is (optional)" value={p.about} maxLength={200} onChange={(e) => set({ products: b.products.map((x, j) => (j === i ? { ...x, about: e.target.value } : x)) })} />
                    {b.products.length > 1 && <button className="icon-btn" aria-label="Remove product" onClick={() => set({ products: b.products.filter((_, j) => j !== i) })}>×</button>}
                  </div>
                ))}
                <button className="ghost small-btn" onClick={() => set({ products: [...b.products, { name: "", about: "" }] })}>+ Add product</button>
              </div>
            )}

            {b.step === 2 && (
              <div className="chat-card">
                <div className="sheet-wrap">
                  <table className="sheet">
                    <thead><tr><th>Creator type (followers)</th><th className="num">How many</th><th className="num">Budget / creator</th><th /></tr></thead>
                    <tbody>
                      {b.rows.map((r, i) => (
                        <tr key={i}>
                          <td><select value={r.tier} onChange={(e) => setRow(i, { tier: e.target.value })}>
                            {TIERS.map((t) => <option key={t} value={t} disabled={used(i).has(t)}>{t} ({tierRange(t)})</option>)}
                          </select></td>
                          <td><input type="number" min={1} max={500} value={r.count || ""} onChange={(e) => setRow(i, { count: Math.max(0, Math.floor(+e.target.value)) })} /></td>
                          <td><input type="number" min={0} step={500} value={r.budget || ""} onChange={(e) => setRow(i, { budget: Math.max(0, +e.target.value) })} /></td>
                          <td>{b.rows.length > 1 && <button className="icon-btn" aria-label="Remove row" onClick={() => set({ rows: b.rows.filter((_, j) => j !== i) })}>×</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td>Total</td><td className="num">{rows.reduce((n, r) => n + r.count, 0)}</td><td className="num">{money(rows.reduce((n, r) => n + r.count * r.budget, 0), b.currency)}</td><td /></tr></tfoot>
                  </table>
                </div>
                <div className="row spread">
                  <button className="ghost small-btn" disabled={b.rows.length >= TIERS.length} onClick={() => set({ rows: [...b.rows, { tier: TIERS.find((t) => !b.rows.some((r) => r.tier === t))!, count: 1, budget: 0 }] })}>+ Add row</button>
                  <label className="cur">Currency<select value={b.currency} onChange={(e) => set({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
                </div>
                {rows.length !== b.rows.length && <div className="small muted">Every row needs a count and a budget.</div>}
              </div>
            )}

            {b.step === 3 && <textarea rows={4} placeholder="Optional" value={b.other} maxLength={2000} onChange={(e) => set({ other: e.target.value })} />}
            {b.step === 4 && <textarea rows={6} placeholder="Optional. Use {{name}} where the creator's name goes." value={b.message} maxLength={2000} onChange={(e) => set({ message: e.target.value })} />}
            {b.step === 5 && <textarea rows={8} placeholder={"Optional (empty = standard 4 follow-ups; none = no follow-ups). Or write your own, up to 4 follow-ups (day 1, 2, 5, 10), separated by a line with ---\nHi {{name}}, just bumping this in case it got buried!\n---\nSecond follow-up text...\n---\nThird...\n---\nFourth..."} value={b.followUp} maxLength={4000} onChange={(e) => set({ followUp: e.target.value })} />}
            {b.step === 6 && (
              <>
                <input type="url" placeholder="https://docs.google.com/spreadsheets/d/…" value={b.sheetUrl} maxLength={300} onChange={(e) => set({ sheetUrl: e.target.value })} onKeyDown={(e) => e.key === "Enter" && next()} />
                {!ok && <div className="small muted">That needs to be a Google Sheets link. If it&apos;s an Excel file in Drive, open it and use File → Save as Google Sheets first.</div>}
              </>
            )}

            {b.step < Q.length && (
              <div className="row spread">
                {b.step > 0 ? <button className="ghost small-btn" onClick={() => set({ step: b.step - 1 })}>Back</button> : <span />}
                <div className="row" style={{ gap: ".4rem" }}>
                  {b.step >= 3 && <button className="ghost small-btn" onClick={() => set({ step: b.step + 1, ...(b.step === 3 ? { other: "" } : b.step === 4 ? { message: "" } : b.step === 5 ? { followUp: "" } : { sheetUrl: "" }) })}>Skip</button>}
                  <button className="small-btn" disabled={!ok} onClick={next}>{b.step === Q.length - 1 ? "Review" : "Next"}</button>
                </div>
              </div>
            )}

            {b.step >= Q.length && !b.sent && (
              <>
                <div className="bubble bot">{edit ? "Review the changes, then save. Already-sent DMs and anything already agreed keep what they were sent; only new work uses the updated numbers. To change an answer, click it above." : "All set. Send it to the automation: Cowork picks it up on its next scheduled run, finds creators, and you approve the shortlist on the Campaigns page before anything is sent. To change an answer, click it above."}</div>
                {err && <div className="notice" role="alert" style={{ margin: 0, borderLeftColor: "var(--bad)" }}>{err}</div>}
                <div className="row spread">
                  <button className="ghost small-btn" onClick={() => set({ step: Q.length - 1 })}>Back</button>
                  <button className="small-btn" disabled={busy} onClick={submit}>{busy ? (edit ? "Saving…" : "Sending…") : (edit ? "Save changes" : "Send to automation")}</button>
                </div>
                {!edit && (
                  <details>
                    <summary className="small">Or copy a prompt to run it by hand in Cowork</summary>
                    <textarea id="brief-out" className="prompt-out" rows={10} value={prompt} readOnly onFocus={(e) => e.currentTarget.select()} style={{ marginTop: ".5rem" }} />
                    <div className="row" style={{ justifyContent: "flex-end", marginTop: ".5rem" }}><button className="ghost small-btn" onClick={copy}>{copied ? "Copied ✓" : "Copy prompt"}</button></div>
                  </details>
                )}
              </>
            )}
            {b.sent && edit && (
              <>
                <div className="bubble bot">Saved ✓</div>
                <div className="row spread"><span /><button className="small-btn" onClick={() => setOpen(false)}>Close</button></div>
              </>
            )}
            {b.sent && !edit && (
              <>
                <div className="bubble bot">Sent ✓ <b>{b.client}</b> is on the Campaigns page. You&apos;ll get a notification when its shortlist is ready to approve.</div>
                <div className="row spread">
                  <Link className="btn ghost small-btn" href="/campaigns" onClick={() => setOpen(false)}>Open Campaigns</Link>
                  <button className="small-btn" onClick={() => { setB(blank()); setErr(""); }}>Start another brief</button>
                </div>
              </>
            )}
            <div ref={end} />
          </div>
        </section>
      )}
    </>
  );
}

const Spark = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="16" height="16"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" /></svg>;
