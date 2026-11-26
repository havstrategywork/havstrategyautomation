"use client";
// The admin editor for the public onboarding form: sections and questions can be added, reworded, reordered, moved and removed.
// Nothing changes for clients until "Save changes"; the server re-checks everything (lib/onboarding.ts validateForm).
import { useEffect, useState } from "react";
import { saveOnboardingForm } from "@/app/(main)/onboarding-form/actions";
import Select from "@/components/mui/Select";
import { FIELD_TYPES, LIMITS, LOCKED, SERVICES, type Field, type FieldType, type ServiceId, type Step } from "@/lib/onboarding";

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
const isLocked = (f: Field) => Object.hasOwn(LOCKED, f.id);
const typeLabel = (t: FieldType) => FIELD_TYPES.find((x) => x.value === t)?.label ?? t;
const move = <T,>(list: T[], from: number, to: number) => {
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  copy.splice(to, 0, ...copy.splice(from, 1));
  return copy;
};

export default function OnboardingEditor({ initial, initialVersion }: { initial: Step[]; initialVersion: number }) {
  const [steps, setSteps] = useState(initial), [saved, setSaved] = useState(() => JSON.stringify(initial)), [version, setVersion] = useState(initialVersion);
  const [open, setOpen] = useState<Record<string, boolean>>({}), [saving, setSaving] = useState(false), [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(steps) !== saved;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = (fn: (s: Step[]) => Step[]) => { setSteps(fn); setNote(null); };
  const setStep = (id: string, patch: Partial<Step>) => change((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const setFields = (id: string, fn: (f: Field[]) => Field[]) => change((all) => all.map((s) => (s.id === id ? { ...s, fields: fn(s.fields) } : s)));
  const setField = (stepId: string, fieldId: string, patch: Partial<Field>) => setFields(stepId, (fs) => fs.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)));
  const toggleOpen = (id: string, value: boolean) => setOpen((o) => (!!o[id] === value ? o : { ...o, [id]: value }));

  function addQuestion(step: Step) {
    const field: Field = { id: newId("q"), label: "", type: "text" };
    setFields(step.id, (fs) => [...fs, field]);
    setOpen((o) => ({ ...o, [step.id]: true, [field.id]: true }));
  }
  function addSection() {
    const step: Step = { id: newId("s"), title: "New section", intro: "", fields: [{ id: newId("q"), label: "", type: "text" }] };
    change((all) => [...all, step]);
    setOpen((o) => ({ ...o, [step.id]: true, [step.fields[0].id]: true }));
  }
  function moveToSection(from: Step, field: Field, to: string) {
    if (to === from.id) return;
    change((all) => all.map((s) => (s.id === from.id ? { ...s, fields: s.fields.filter((f) => f.id !== field.id) } : s.id === to ? { ...s, fields: [...s.fields, field] } : s)));
    setOpen((o) => ({ ...o, [to]: true }));
  }

  async function save() {
    setSaving(true); setNote(null);
    try {
      const r = await saveOnboardingForm(JSON.stringify(steps), version);
      if (!r.ok) setNote({ ok: false, text: r.error });
      else { setSteps(r.steps); setSaved(JSON.stringify(r.steps)); setVersion(r.version); setNote({ ok: true, text: "Saved. Clients now see the new version." }); }
    } catch { setNote({ ok: false, text: "Could not reach the server. Your changes are still here; try saving again." }); }
    setSaving(false);
  }

  const total = steps.reduce((n, s) => n + s.fields.length, 0);

  return (
    <div className="fe">
      <p className="muted small">{steps.length - 1} sections · {total} questions. Removing a question keeps the answers already collected.</p>
      {steps.map((step, i) => {
        const picker = step.kind === "services", locked = step.fields.some(isLocked);
        return (
          <details key={step.id} className="card fe-step" open={!!open[step.id]} onToggle={(e) => toggleOpen(step.id, e.currentTarget.open)}>
            <summary>
              <span className="fe-title"><b>{step.title || "(untitled section)"}</b>
                <small className="muted">{picker ? "Service picker (always first)" : `${step.fields.length} question${step.fields.length === 1 ? "" : "s"}`}</small></span>
              <span className="row">
                {step.services?.length ? step.services.map((s) => <span key={s} className="chip">{SERVICES.find((x) => x.id === s)?.label}</span>) : <span className="chip soft">Every client</span>}
              </span>
            </summary>
            {open[step.id] && (
              <div className="fe-body">
                <div className="f2">
                  <label>Section title<input value={step.title} maxLength={LIMITS.title} onChange={(e) => setStep(step.id, { title: e.target.value })} /></label>
                  <label>Short introduction<input value={step.intro} maxLength={LIMITS.intro} onChange={(e) => setStep(step.id, { intro: e.target.value })} /></label>
                </div>
                {!picker && (
                  <>
                    <fieldset disabled={locked}>
                      <legend>{locked ? "Shown to every client (it holds the name and email questions)" : "Only show for these services (none ticked = every client)"}</legend>
                      <div className="row">
                        {SERVICES.map((s) => (
                          <label key={s.id}>
                            <input type="checkbox" checked={!!step.services?.includes(s.id)}
                              onChange={(e) => { const next: ServiceId[] = SERVICES.map((x) => x.id).filter((x) => (x === s.id ? e.target.checked : step.services?.includes(x))); setStep(step.id, { services: next.length ? next : undefined }); }} />
                            {s.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    {step.fields.map((field, j) => (
                      <details key={field.id} className="fe-q" open={!!open[field.id]} onToggle={(e) => { e.stopPropagation(); toggleOpen(field.id, e.currentTarget.open); }}>
                        <summary>
                          <span className="fe-n">{j + 1}</span>
                          <span className="fe-label">{field.label || <i className="muted">New question</i>}</span>
                          <span className="row">{field.required && <span className="chip">Required</span>}<span className="chip soft">{typeLabel(field.type)}</span></span>
                        </summary>
                        {open[field.id] && (
                          <div className="fe-body">
                            <label>Question<textarea rows={2} value={field.label} maxLength={LIMITS.label} onChange={(e) => setField(step.id, field.id, { label: e.target.value })} /></label>
                            <div className="f2">
                              {isLocked(field)
                                ? <div className="lbl"><span>Answer type</span><span className="muted">{typeLabel(field.type)} (fixed)</span></div>
                                : <Select label="Answer type" value={field.type} options={FIELD_TYPES} onChange={(v) => setField(step.id, field.id, { type: v as FieldType })} />}
                              <Select label="Section" value={step.id} onChange={(v) => moveToSection(step, field, v)}
                                options={steps.filter((s) => s.kind !== "services").map((s) => ({ value: s.id, label: s.title || "(untitled section)", disabled: isLocked(field) && !!s.services?.length }))} />
                            </div>
                            <div className="f2">
                              <label>Help text under the question (optional)<input value={field.help ?? ""} maxLength={LIMITS.help} onChange={(e) => setField(step.id, field.id, { help: e.target.value })} /></label>
                              {field.type !== "scale" && field.type !== "file" && (
                                <label>Placeholder inside the box (optional)<input value={field.placeholder ?? ""} maxLength={LIMITS.placeholder} onChange={(e) => setField(step.id, field.id, { placeholder: e.target.value })} /></label>
                              )}
                            </div>
                            <div className="row spread">
                              <label className="fe-check"><input type="checkbox" checked={!!field.required} disabled={isLocked(field)} onChange={(e) => setField(step.id, field.id, { required: e.target.checked || undefined })} />Clients must answer this</label>
                              <span className="row">
                                <button type="button" className="ghost small-btn" disabled={j === 0} onClick={() => setFields(step.id, (fs) => move(fs, j, j - 1))}>↑ Up</button>
                                <button type="button" className="ghost small-btn" disabled={j === step.fields.length - 1} onClick={() => setFields(step.id, (fs) => move(fs, j, j + 1))}>↓ Down</button>
                                <button type="button" className="ghost small-btn fe-danger" disabled={isLocked(field)} title={isLocked(field) ? "The dashboard needs this answer" : undefined}
                                  onClick={() => { if (!field.label || confirm(`Remove this question?\n\n${field.label}\n\nAnswers already collected are kept.`)) setFields(step.id, (fs) => fs.filter((f) => f.id !== field.id)); }}>Remove question</button>
                              </span>
                            </div>
                          </div>
                        )}
                      </details>
                    ))}

                    <div className="row spread">
                      <button type="button" className="small-btn" onClick={() => addQuestion(step)}>+ Add question</button>
                      <span className="row">
                        <button type="button" className="ghost small-btn" disabled={i <= 1} onClick={() => change((all) => move(all, i, i - 1))}>↑ Move section up</button>
                        <button type="button" className="ghost small-btn" disabled={i === steps.length - 1} onClick={() => change((all) => move(all, i, i + 1))}>↓ Move section down</button>
                        <button type="button" className="ghost small-btn fe-danger" disabled={locked}
                          onClick={() => { if (confirm(`Remove the section "${step.title}" and its ${step.fields.length} question(s)?\n\nAnswers already collected are kept.`)) change((all) => all.filter((s) => s.id !== step.id)); }}>Remove section</button>
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </details>
        );
      })}

      <button type="button" className="ghost" onClick={addSection}>+ Add section</button>

      <div className="fe-bar">
        <button type="button" onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save changes"}</button>
        <button type="button" className="ghost" disabled={!dirty || saving} onClick={() => { if (confirm("Throw away your unsaved changes?")) { setSteps(JSON.parse(saved)); setNote(null); } }}>Discard</button>
        <span role="status" className="small" style={{ color: note ? (note.ok ? "var(--good)" : "var(--bad)") : "var(--muted)" }}>{note?.text ?? (dirty ? "Unsaved changes" : "No changes")}</span>
      </div>
    </div>
  );
}
