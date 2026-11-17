"use client";
// Scripted "chat" that collects a campaign brief one question at a time and turns it into a Claude Cowork prompt.
// No AI runs here: the questions are fixed; Cowork does the thinking once the prompt is pasted. Draft is kept in localStorage.
import { useEffect, useRef, useState } from "react";
import { TIERS } from "@/lib/fields";
import { buildPrompt, cleanRows, money, tierRange, type Brief, type Row } from "@/lib/brief";

const KEY = "briefDraft";
const blank = (): Brief & { step: number } => ({ step: 0, client: "", products: [{ name: "", about: "" }], rows: [{ tier: "Micro", count: 2, budget: 10000 }], currency: "INR", other: "", message: "" });
const CURRENCIES = ["INR", "AED", "USD", "EUR", "GBP"];
const Q = [
  "Hi! Let's put together a campaign brief. What's the client or brand name?",
  "Which products are we promoting? Add each one, with a line about it if it helps.",
  "What creators do you need? Add a row per tier: how many, and the most you'd pay each.",
  "Any other requirements? Location, niche, audience, deliverables, timeline, brands to avoid…",
  "Paste the outreach message to send, word for word. Skip it and Cowork will draft one for your approval.",
];

export default function BriefChat({ appUrl, apiKey }: { appUrl: string; apiKey: string }) {
  const [open, setOpen] = useState(false);
  const [b, setB] = useState(blank);
  const [copied, setCopied] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { try { const s = localStorage.getItem(KEY); if (s) setB({ ...blank(), ...JSON.parse(s) }); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch {} }, [b]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [b.step, open]);

  const set = (p: Partial<typeof b>) => setB((x) => ({ ...x, ...p }));
  const setRow = (i: number, p: Partial<Row>) => set({ rows: b.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const products = b.products.filter((p) => p.name.trim());
  const rows = cleanRows(b.rows);
  const ok = [b.client.trim() !== "", products.length > 0, rows.length > 0 && rows.length === b.rows.length, true, true][b.step] ?? true;
  const next = () => ok && set({ step: b.step + 1 });

  const answer = (i: number) => [
    b.client,
    products.map((p) => p.name).join(", "),
    rows.map((r) => `${r.count} × ${r.tier} at up to ${money(r.budget, b.currency)}`).join(" · "),
    b.other.trim() || "None",
    b.message.trim() ? `“${b.message.trim().slice(0, 90)}${b.message.trim().length > 90 ? "…" : ""}”` : "Skipped, Cowork will draft one",
  ][i];
  const prompt = b.step >= Q.length ? buildPrompt(b, appUrl || (typeof location === "undefined" ? "" : location.origin), apiKey) : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt); } catch { (document.getElementById("brief-out") as HTMLTextAreaElement | null)?.select(); document.execCommand?.("copy"); }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };
  const used = (i: number) => new Set(b.rows.filter((_, j) => j !== i).map((r) => r.tier));

  return (
    <>
      {!open && <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Open campaign brief chat"><Spark /> New brief</button>}
      {open && (
        <section className="chat-panel" role="dialog" aria-label="Campaign brief">
          <header className="chat-head">
            <div className="row" style={{ gap: ".55rem" }}><span className="chat-dot"><Spark /></span><div><b>Campaign brief</b><small>Builds a prompt for Claude Cowork</small></div></div>
            <div className="row" style={{ gap: ".3rem" }}>
              <button className="icon-btn" title="Start over" aria-label="Start over" onClick={() => { setB(blank()); setCopied(false); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></svg></button>
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

            {b.step < Q.length && (
              <div className="row spread">
                {b.step > 0 ? <button className="ghost small-btn" onClick={() => set({ step: b.step - 1 })}>Back</button> : <span />}
                <div className="row" style={{ gap: ".4rem" }}>
                  {b.step >= 3 && <button className="ghost small-btn" onClick={() => set({ step: b.step + 1, ...(b.step === 3 ? { other: "" } : { message: "" }) })}>Skip</button>}
                  <button className="small-btn" disabled={!ok} onClick={next}>{b.step === Q.length - 1 ? "Build prompt" : "Next"}</button>
                </div>
              </div>
            )}

            {b.step >= Q.length && (
              <>
                <div className="bubble bot">Done. Copy this prompt and paste it into Claude Cowork. To change something, click any of your answers above.</div>
                <textarea id="brief-out" className="prompt-out" rows={12} value={prompt} readOnly onFocus={(e) => e.currentTarget.select()} />
                <div className="row spread">
                  <button className="ghost small-btn" onClick={() => set({ step: Q.length - 1 })}>Back</button>
                  <button className="small-btn" onClick={copy}>{copied ? "Copied ✓" : "Copy prompt"}</button>
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
