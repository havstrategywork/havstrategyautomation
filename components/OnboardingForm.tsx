"use client";
// The public client onboarding form; the questions come from the server (lib/onboardingForm.ts, edited by admins). Light only; see onboarding.css.
// Flow: pick services (at least one) -> your details -> shared steps -> one block per chosen service -> working together -> submit.
// Answers autosave in the browser, so a refresh or a closed tab never loses a long form.
import { useEffect, useRef, useState } from "react";
import "./onboarding.css";
import { SERVICES, stepErrors, visibleSteps, type Field, type ServiceId, type Step } from "@/lib/onboarding";
import { useUploadThing } from "@/lib/uploadthing";

type Answers = Record<string, string>;
const KEY = "hav-onboarding-v1";
const PATH = {
  social: "M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z",
  creator: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  google: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  meta: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12",
  seo: "M3 17l6-6 4 4 8-8M15 7h6v6",
} as const;
const Svg = ({ d, sw = 1.8 }: { d: string; sw?: number }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const CHECK = "M5 12.5l4.5 4.5L19 7.5";

const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);
const fileName = (line: string) => line.replace(/\s*[—-]\s*https:\/\/\S+$/, "") || "file";

function FileField({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  const [pct, setPct] = useState<number | null>(null), [err, setErr] = useState(""), [over, setOver] = useState(false), input = useRef<HTMLInputElement>(null);
  const { startUpload } = useUploadThing("onboardingFile", { onUploadProgress: setPct, onUploadError: (e) => setErr(e.message || "Upload failed. Try again.") });
  const have = lines(value);
  async function add(files: File[]) {
    if (!files.length) return;
    setErr("");
    if (have.length + files.length > 10) return setErr("You can add up to 10 files here.");
    setPct(0);
    const res = await startUpload(files.slice(0, 5));
    setPct(null);
    if (res?.length) onChange([...have, ...res.map((r) => `${r.name} — ${r.ufsUrl}`)].join("\n"));
  }
  return (
    <div>
      <button type="button" className={`ob-drop${over ? " over" : ""}`} onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void add([...e.dataTransfer.files]); }}>
        <Svg d="M12 16V4M7 9l5-5 5 5M4 20h16" /><span><b>Click to upload</b> or drag files here</span><span>Up to 16MB each</span>
      </button>
      <input ref={input} type="file" multiple hidden onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ""; }} />
      {pct !== null && <div className="ob-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${field.label}`}><i style={{ width: `${pct}%` }} /></div>}
      {err && <div className="ob-err" role="alert">{err}</div>}
      {have.length > 0 && (
        <ul className="ob-files">
          {have.map((l, i) => <li key={l}><Svg d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" /><span>{fileName(l)}</span><button type="button" aria-label={`Remove ${fileName(l)}`} onClick={() => onChange(have.filter((_, j) => j !== i).join("\n"))}>✕</button></li>)}
        </ul>
      )}
    </div>
  );
}

function FieldView({ field, value, error, onChange }: { field: Field; value: string; error?: string; onChange: (v: string) => void }) {
  const id = `f-${field.id}`, common = { id, value, "aria-invalid": !!error || undefined, "aria-describedby": error ? `${id}-e` : undefined, placeholder: field.placeholder, onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => onChange(e.target.value) };
  return (
    <div className={`ob-field${error ? " bad" : ""}`}>
      {field.type === "scale" || field.type === "file" ? <div className="lab" id={`${id}-l`}>{field.label}</div> : <label htmlFor={id}>{field.label}{field.required && <span className="req" aria-hidden="true">*</span>}</label>}
      {field.help && <div className="help">{field.help}</div>}
      {field.type === "long" ? <textarea rows={3} {...common} />
        : field.type === "file" ? <FileField field={field} value={value} onChange={onChange} />
        : field.type === "scale" ? (
          <div>
            <div className="ob-scale" role="radiogroup" aria-labelledby={`${id}-l`}>
              {Array.from({ length: 10 }, (_, n) => String(n + 1)).map((n) => <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(value === n ? "" : n)}>{n}</button>)}
            </div>
            <div className="ob-scale-ends"><span>Not important</span><span>Essential</span></div>
          </div>
        ) : <input type={field.type === "email" ? "email" : "text"} inputMode={field.type === "url" ? "url" : undefined} autoComplete={field.id === "email" ? "email" : field.id === "name" ? "name" : field.id === "company" ? "organization" : "off"} {...common} />}
      {error && <div className="ob-err" id={`${id}-e`} role="alert">{error}</div>}
    </div>
  );
}

export default function OnboardingForm({ form, version }: { form: Step[]; version: number }) {
  const [services, setServices] = useState<ServiceId[]>([]), [answers, setAnswers] = useState<Answers>({}), [stepId, setStepId] = useState("services");
  const [errors, setErrors] = useState<Answers>({}), [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false), [fail, setFail] = useState(""), [done, setDone] = useState<string | null>(null), [ready, setReady] = useState(false);
  const head = useRef<HTMLHeadingElement>(null), hp = useRef<HTMLInputElement>(null);

  const steps = visibleSteps(form, services), idx = Math.max(0, steps.findIndex((s) => s.id === stepId)), step = steps[idx], last = idx === steps.length - 1;

  // restore a saved draft once, then keep saving (storage can be blocked: the form works without it)
  useEffect(() => {
    try { const d = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (d?.services) { setServices(d.services); setAnswers(d.answers ?? {}); setStepId(d.stepId ?? "services"); } } catch {}
    setReady(true);
  }, []);
  useEffect(() => { if (ready && !done) try { localStorage.setItem(KEY, JSON.stringify({ services, answers, stepId })); } catch {} }, [ready, done, services, answers, stepId]);
  const moved = useRef(false); // move focus to the heading only after the visitor navigates, not on first load
  useEffect(() => { if (!ready) return; if (moved.current) head.current?.focus({ preventScroll: true }); moved.current = true; }, [stepId, ready]);

  const set = (id: string, v: string) => { setAnswers((a) => ({ ...a, [id]: v })); if (errors[id]) setErrors((e) => ({ ...e, [id]: "" })); };
  const toggle = (id: ServiceId) => setServices((s) => (s.includes(id) ? s.filter((x) => x !== id) : SERVICES.map((x) => x.id).filter((x) => x === id || s.includes(x))));
  const allOn = services.length === SERVICES.length;
  const go = (to: string) => { setStepId(to); setErrors({}); setTried(false); setFail(""); window.scrollTo({ top: 0, behavior: "smooth" }); };

  async function next() {
    if (step.kind === "services") { if (!services.length) return setTried(true); return go(steps[1].id); }
    const err = stepErrors(step, answers);
    if (Object.keys(err).length) { setErrors(err); setTried(true); return; }
    if (!last) return go(steps[idx + 1].id);
    setSending(true); setFail("");
    try {
      const r = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ services, answers, version, hp: hp.current?.value ?? "" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setFail(j.error ?? "Something went wrong. Please try again.");
      else { setDone(answers.name?.split(" ")[0] || "there"); try { localStorage.removeItem(KEY); } catch {} window.scrollTo({ top: 0 }); }
    } catch { setFail("Could not reach the server. Check your connection and try again."); }
    setSending(false);
  }

  const sparks = ["#5b4ef5", "#a855f7", "#ec4899", "#f59e0b", "#10b981", "#3b82f6"].flatMap((c, i) => [0, 1].map((k) => ({ c, x: Math.cos((i * 2 + k) * 0.52) * (110 + k * 40), y: Math.sin((i * 2 + k) * 0.52) * (90 + k * 30) - 30 })));

  return (
    <div className="ob">
      <div className="ob-shell">
        <aside className="ob-rail">
          {/* A full page load on purpose: the editor is the dashboard, with its own styles and sign-in. */}
          <div className="ob-brand"><img src="/havstrategy-logo.png" alt="" /><span>Havstrategy</span><a className="ob-admin" href="/onboarding-form">Admin</a></div>
          <h1>Let&apos;s build something <em>remarkable</em> together</h1>
          <p>A few questions so we can hit the ground running. It takes about ten minutes, and your answers save as you go.</p>
          <ol className="ob-steps" aria-label="Progress">
            {steps.map((s, i) => (
              <li key={s.id} className={i < idx || done ? "done" : i === idx ? "now" : ""}>
                <button type="button" disabled={!(i < idx) || !!done} onClick={() => go(s.id)} aria-current={i === idx ? "step" : undefined}>
                  <span className="ob-dot">{i < idx || done ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d={CHECK} /></svg> : i + 1}</span>{s.id === "services" ? "Your services" : s.title}
                </button>
              </li>
            ))}
          </ol>
          <div className="ob-note"><Svg d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z" /><span>Your answers go only to the Havstrategy team.</span></div>
        </aside>

        <main className="ob-card">
          <div className="ob-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={done ? 100 : Math.round(((idx + 1) / steps.length) * 100)} aria-label="Form progress"><i style={{ width: `${done ? 100 : ((idx + 1) / steps.length) * 100}%` }} /></div>

          {done ? (
            <div className="ob-body"><div className="ob-done">
              {sparks.map((s, i) => <i key={i} className="ob-spark" style={{ background: s.c, ["--x" as string]: `${s.x}px`, ["--y" as string]: `${s.y}px` }} />)}
              <div className="ob-check"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d={CHECK} /></svg></div>
              <h2>Thank you, <em>{done}</em></h2>
              <p>We have your answers and the team is already reading them. Expect to hear from us shortly.</p>
              <div className="chips">{services.map((s) => <span key={s}>{SERVICES.find((x) => x.id === s)!.label}</span>)}</div>
            </div></div>
          ) : (
            <form noValidate onSubmit={(e) => { e.preventDefault(); void next(); }}>
              <div className="ob-body">
                <div className="ob-step" key={step.id}>
                  <div className="ob-head">
                    <div className="ob-count">Step {idx + 1} of {steps.length}</div>
                    <h2 ref={head} tabIndex={-1}>{step.title}</h2>
                    <p>{step.intro}</p>
                  </div>

                  {step.kind === "services" ? (
                    <>
                      <div className="ob-pickbar">
                        <span className={`ob-hint ${services.length ? "ok" : tried ? "warn" : ""}`} role="status">{services.length ? `${services.length} selected` : "Pick at least one to continue"}</span>
                        <button type="button" className="ob-all" onClick={() => setServices(allOn ? [] : SERVICES.map((s) => s.id))}>{allOn ? "Clear all" : "Select all"}</button>
                      </div>
                      <div className="ob-svcs" role="group" aria-label="Services">
                        {SERVICES.map((s) => (
                          <button key={s.id} type="button" role="checkbox" aria-checked={services.includes(s.id)} className="ob-svc" onClick={() => toggle(s.id)}>
                            <span className="ob-tick"><svg viewBox="0 0 24 24" fill="none" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d={CHECK} /></svg></span>
                            <span className="ob-ico"><Svg d={PATH[s.id]} /></span>
                            <b>{s.label}</b><span className="b">{s.blurb}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="ob-fields">
                      {step.fields.map((fd) => <FieldView key={fd.id} field={fd} value={answers[fd.id] ?? ""} error={errors[fd.id]} onChange={(v) => set(fd.id, v)} />)}
                    </div>
                  )}
                  <input ref={hp} className="ob-hp" type="text" name="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" defaultValue="" />
                </div>
              </div>
              <div className="ob-foot">
                {idx > 0 ? <button type="button" className="ob-back" onClick={() => go(steps[idx - 1].id)}>← Back</button> : <span />}
                <span className="msg" role="alert">{fail || (tried && Object.values(errors).some(Boolean) ? "Please fix the highlighted answers." : "")}</span>
                <button className="ob-next" type="submit" disabled={sending || (step.kind === "services" && !services.length)}>
                  {sending ? "Sending…" : last ? "Submit" : "Continue"}<Svg d="M5 12h14M13 6l6 6-6 6" />
                </button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
