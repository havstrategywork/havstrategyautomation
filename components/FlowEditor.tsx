"use client";
// Drag-and-drop flow canvas: steps are boxes you drag by their header; drag from a round dot on the right of a row to another box to connect them.
// No graph library: positions of the dots are measured from the DOM and the lines are SVG curves. Everything the editor sends is re-validated on the server.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Select from "@/components/mui/Select";
import { LIM, newId, portsOf, type Btn, type BotEdge, type BotNode, type Card, type Flow, type MessageData, type QuestionData, type TriggerData } from "@/lib/botflow";

type Save = (id: string, flow: Flow) => Promise<{ ok: boolean; errors: string[] }>;
type Sel = { kind: "node" | "edge"; id: string } | null;
const W = 250;

/** Drop connections whose start (button, choice) or end no longer exists. */
const prune = (f: Flow): Flow => ({ ...f, edges: f.edges.filter((e) => { const from = f.nodes.find((n) => n.id === e.from); return from && portsOf(from).includes(e.port) && f.nodes.some((n) => n.id === e.to); }) });

const portLabel = (n: BotNode, port: string) => {
  if (port === "out") return n.type === "trigger" ? "Start" : n.type === "question" ? "Any other answer" : "Then";
  if (n.type === "question") return `Answer: ${n.data.choices.find((c) => `choice:${c.id}` === port)?.title ?? ""}`;
  if (n.type === "message") return `Button: ${[...(n.data.buttons ?? []), ...(n.data.cards ?? []).flatMap((c) => c.buttons)].find((b) => `btn:${b.id}` === port)?.title ?? ""}`;
  return port;
};
const summary = (n: BotNode) => n.type === "trigger" ? (n.data.keywords.length ? `When a message contains: ${n.data.keywords.join(", ")}` : "Every message") : n.type === "question" ? n.data.text || "(empty question)" : n.data.kind === "carousel" ? `Carousel, ${n.data.cards?.length ?? 0} cards` : n.data.kind === "image" ? `Image${n.data.text ? `: ${n.data.text}` : ""}` : n.data.text || "(empty message)";
const title = (n: BotNode) => (n.type === "trigger" ? "Trigger" : n.type === "question" ? "Question" : `Message · ${n.data.kind}`);

export default function FlowEditor({ id, initial, save }: { id: string; initial: Flow; save: Save }) {
  const [flow, setFlow] = useState<Flow>(initial);
  const [sel, setSel] = useState<Sel>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error"; errors?: string[] }>({ kind: "idle" });
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const [drag, setDrag] = useState<{ from: string; port: string; x: number; y: number } | null>(null);
  const inner = useRef<HTMLDivElement>(null), wrap = useRef<HTMLDivElement>(null);
  const moving = useRef<{ id: string; px: number; py: number; nx: number; ny: number } | null>(null);

  const edit = (fn: (f: Flow) => Flow) => { setFlow((f) => prune(fn(f))); setDirty(true); setStatus({ kind: "idle" }); };
  const setData = (nodeId: string, data: BotNode["data"]) => edit((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === nodeId ? ({ ...n, data } as BotNode) : n)) }));
  const node = sel?.kind === "node" ? flow.nodes.find((n) => n.id === sel.id) : undefined;

  // measure every connection dot, so lines can be drawn between them
  useLayoutEffect(() => {
    const el = inner.current; if (!el) return;
    const base = el.getBoundingClientRect(), next: Record<string, { x: number; y: number }> = {};
    el.querySelectorAll<HTMLElement>("[data-port],[data-in]").forEach((d) => { const r = d.getBoundingClientRect(); next[d.dataset.port ? `out:${d.dataset.port}` : `in:${d.dataset.in}`] = { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 }; });
    setPos((p) => (JSON.stringify(p) === JSON.stringify(next) ? p : next));
  });

  useEffect(() => { // leaving with unsaved changes asks first
    const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  useEffect(() => { // dragging a new connection: follow the pointer, connect on release over a box
    if (!drag) return;
    const move = (e: PointerEvent) => { const b = inner.current!.getBoundingClientRect(); setDrag((d) => d && { ...d, x: e.clientX - b.left, y: e.clientY - b.top }); };
    const up = (e: PointerEvent) => {
      const to = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-node]")?.dataset.node;
      const target = flow.nodes.find((n) => n.id === to);
      if (target && target.type !== "trigger" && target.id !== drag.from) edit((f) => ({ ...f, edges: [...f.edges.filter((x) => !(x.from === drag.from && x.port === drag.port)), { id: newId(), from: drag.from, port: drag.port, to: target.id }] }));
      setDrag(null);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  });

  const startMove = (n: BotNode) => (e: React.PointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture(e.pointerId); moving.current = { id: n.id, px: e.clientX, py: e.clientY, nx: n.x, ny: n.y }; setSel({ kind: "node", id: n.id }); };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => { const m = moving.current; if (!m) return; edit((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === m.id ? { ...n, x: Math.max(0, Math.round(m.nx + e.clientX - m.px)), y: Math.max(0, Math.round(m.ny + e.clientY - m.py)) } : n)) })); };
  const startLink = (from: string, port: string) => (e: React.PointerEvent) => { e.stopPropagation(); e.preventDefault(); const b = inner.current!.getBoundingClientRect(); setDrag({ from, port, x: e.clientX - b.left, y: e.clientY - b.top }); };

  const add = (type: "message" | "question") => {
    const w = wrap.current, n = flow.nodes.length, nid = newId();
    const base = { id: nid, x: (w?.scrollLeft ?? 0) + 40 + (n % 6) * 28, y: (w?.scrollTop ?? 0) + 40 + (n % 6) * 28 };
    edit((f) => ({ ...f, nodes: [...f.nodes, type === "message" ? { ...base, type, data: { kind: "text", text: "" } } : { ...base, type, data: { text: "", saveAs: "", choices: [] } }] }));
    setSel({ kind: "node", id: nid });
  };
  const remove = () => {
    if (!sel) return;
    if (sel.kind === "edge") edit((f) => ({ ...f, edges: f.edges.filter((e) => e.id !== sel.id) }));
    else if (node && node.type !== "trigger") edit((f) => ({ ...f, nodes: f.nodes.filter((n) => n.id !== sel.id), edges: f.edges.filter((e) => e.from !== sel.id && e.to !== sel.id) }));
    setSel(null);
  };
  const doSave = async () => {
    setStatus({ kind: "saving" });
    try { const r = await save(id, flow); if (r.ok) { setDirty(false); setStatus({ kind: "saved" }); } else setStatus({ kind: "error", errors: r.errors }); }
    catch { setStatus({ kind: "error", errors: ["Could not save. Check your connection and try again."] }); }
  };

  const cw = Math.max(1400, ...flow.nodes.map((n) => n.x + W + 300)), ch = Math.max(800, ...flow.nodes.map((n) => n.y + 520));
  const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => `M${a.x} ${a.y} C${a.x + 70} ${a.y} ${b.x - 70} ${b.y} ${b.x} ${b.y}`;

  return (
    <div className="editor">
      <div className="editor-bar">
        <button type="button" className="ghost small-btn" onClick={() => add("message")}>+ Message</button>
        <button type="button" className="ghost small-btn" onClick={() => add("question")}>+ Question</button>
        <button type="button" className="ghost small-btn" disabled={!sel || (sel.kind === "node" && node?.type === "trigger")} onClick={remove} style={{ color: "var(--bad)" }}>Delete {sel?.kind === "edge" ? "connection" : "step"}</button>
        <span style={{ flex: 1 }} />
        <span className="small muted" aria-live="polite">{status.kind === "saving" ? "Saving…" : status.kind === "saved" ? "Saved ✓" : dirty ? "Unsaved changes" : ""}</span>
        <button type="button" onClick={doSave} disabled={!dirty || status.kind === "saving"}>Save flow</button>
      </div>
      {status.kind === "error" && <div className="notice" role="alert" style={{ margin: 0, borderLeftColor: "var(--bad)" }}><b>Not saved:</b><ul style={{ margin: ".3rem 0 0", paddingLeft: "1.1rem" }}>{status.errors?.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}

      <div className="editor-main">
        <div className="canvas-wrap" ref={wrap} tabIndex={0} onKeyDown={(e) => { if ((e.key === "Delete" || e.key === "Backspace") && !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) remove(); }} onPointerDown={(e) => { if (e.target === e.currentTarget || e.target === inner.current) setSel(null); }}>
          <div className="canvas" ref={inner} style={{ width: cw, height: ch }}>
            <svg className="fedges" width={cw} height={ch} aria-hidden="true">
              <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="currentColor" /></marker></defs>
              {flow.edges.map((e: BotEdge) => {
                const a = pos[`out:${e.from}|${e.port}`], b = pos[`in:${e.to}`]; if (!a || !b) return null;
                const on = sel?.kind === "edge" && sel.id === e.id;
                return (
                  <g key={e.id} className={`fedge${on ? " on" : ""}`}>
                    <path d={curve(a, b)} fill="none" strokeWidth={2} markerEnd="url(#arr)" />
                    <path d={curve(a, b)} fill="none" stroke="transparent" strokeWidth={16} style={{ pointerEvents: "stroke", cursor: "pointer" }} onClick={() => setSel({ kind: "edge", id: e.id })} />
                  </g>
                );
              })}
              {drag && pos[`out:${drag.from}|${drag.port}`] && <path className="fedge on" d={curve(pos[`out:${drag.from}|${drag.port}`], drag)} fill="none" strokeWidth={2} strokeDasharray="5 4" />}
            </svg>
            {flow.nodes.map((n) => (
              <div key={n.id} data-node={n.id} className={`fnode ${n.type}${sel?.kind === "node" && sel.id === n.id ? " sel" : ""}`} style={{ left: n.x, top: n.y, width: W }} onPointerDown={() => setSel({ kind: "node", id: n.id })}>
                {n.type !== "trigger" && <span className="fport in" data-in={n.id} title="Drop a connection here" />}
                <div className="fhead" onPointerDown={startMove(n)} onPointerMove={onMove} onPointerUp={() => (moving.current = null)}>{title(n)}</div>
                <div className="fbody">{summary(n)}</div>
                <ul className="fports">
                  {portsOf(n).map((p) => (
                    <li key={p}><span>{portLabel(n, p)}</span><span className="fport out" data-port={`${n.id}|${p}`} onPointerDown={startLink(n.id, p)} title="Drag to another step" /></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <aside className="panel">
          {!sel && <p className="muted small" style={{ margin: 0 }}>Click a step to edit it. Drag a step by its coloured header. To connect, drag from the round dot next to &quot;Then&quot;, a button or an answer onto another step. Click a line to select it, then delete it.</p>}
          {sel?.kind === "edge" && <p className="small" style={{ margin: 0 }}>Connection selected. Use &quot;Delete connection&quot; above.</p>}
          {node?.type === "trigger" && <TriggerPanel data={node.data} set={(d) => setData(node.id, d)} />}
          {node?.type === "message" && <MessagePanel data={node.data} set={(d) => setData(node.id, d)} />}
          {node?.type === "question" && <QuestionPanel data={node.data} set={(d) => setData(node.id, d)} />}
        </aside>
      </div>
    </div>
  );
}

// ---- side panels ----
const Count = ({ v, max }: { v?: string; max: number }) => <span className={`small ${(v?.length ?? 0) > max ? "" : "muted"}`} style={(v?.length ?? 0) > max ? { color: "var(--bad)" } : undefined}>{v?.length ?? 0}/{max}</span>;

function TriggerPanel({ data, set }: { data: TriggerData; set: (d: TriggerData) => void }) {
  const [text, setText] = useState(data.keywords.join(", "));
  return (
    <div className="form">
      <h3 style={{ margin: 0 }}>Trigger</h3>
      <label>Keywords (separate with commas)
        <textarea rows={3} value={text} placeholder="price, cost, offer" onChange={(e) => { setText(e.target.value); set({ keywords: e.target.value.split(/[,\n]/).map((k) => k.trim()).filter(Boolean) }); }} />
      </label>
      <p className="small muted" style={{ margin: 0 }}>The flow starts when a message contains any of these words. Leave it empty to reply to every message that no other flow with keywords answers.</p>
    </div>
  );
}

function BtnEditor({ buttons, set, max = LIM.buttons }: { buttons: Btn[]; set: (b: Btn[]) => void; max?: number }) {
  return (
    <div className="form" style={{ gap: ".5rem" }}>
      {buttons.map((b, i) => (
        <div key={b.id} className="mini">
          <div className="row spread"><span className="small muted">Button {i + 1}</span><Count v={b.title} max={LIM.title} /></div>
          <input value={b.title} placeholder="Button text" onChange={(e) => set(buttons.map((x) => (x.id === b.id ? { ...x, title: e.target.value } : x)))} />
          <input value={b.url ?? ""} placeholder="https://… (empty = a reply button you connect to a step)" onChange={(e) => set(buttons.map((x) => (x.id === b.id ? { ...x, url: e.target.value || undefined } : x)))} />
          <button type="button" className="ghost small-btn" onClick={() => set(buttons.filter((x) => x.id !== b.id))}>Remove button</button>
        </div>
      ))}
      <button type="button" className="ghost small-btn" disabled={buttons.length >= max} onClick={() => set([...buttons, { id: newId(), title: "" }])}>+ Add button</button>
    </div>
  );
}

function MessagePanel({ data, set }: { data: MessageData; set: (d: MessageData) => void }) {
  const cards = data.cards ?? [], patchCard = (id: string, p: Partial<Card>) => set({ ...data, cards: cards.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  return (
    <div className="form">
      <h3 style={{ margin: 0 }}>Message</h3>
      <Select label="Type" value={data.kind} onChange={(v) => set({ ...data, kind: v as MessageData["kind"] })} options={[{ value: "text", label: "Text" }, { value: "image", label: "Image" }, { value: "buttons", label: "Text with buttons" }, { value: "carousel", label: "Carousel (cards)" }]} />
      {data.kind !== "carousel" && (
        <label><span className="row spread"><span>{data.kind === "image" ? "Text sent before the image (optional)" : "Message"}</span><Count v={data.text} max={data.kind === "buttons" ? LIM.buttonText : LIM.text} /></span>
          <textarea rows={4} value={data.text ?? ""} onChange={(e) => set({ ...data, text: e.target.value })} />
        </label>
      )}
      {data.kind === "image" && <label>Image address (https)<input value={data.image ?? ""} placeholder="https://…/photo.jpg" onChange={(e) => set({ ...data, image: e.target.value })} /></label>}
      {data.kind === "buttons" && <BtnEditor buttons={data.buttons ?? []} set={(buttons) => set({ ...data, buttons })} />}
      {data.kind === "carousel" && (
        <>
          {cards.map((c, i) => (
            <div key={c.id} className="mini">
              <div className="row spread"><b className="small">Card {i + 1}</b><button type="button" className="ghost small-btn" onClick={() => set({ ...data, cards: cards.filter((x) => x.id !== c.id) })}>Remove card</button></div>
              <label><span className="row spread"><span>Title</span><Count v={c.title} max={LIM.cardText} /></span><input value={c.title} onChange={(e) => patchCard(c.id, { title: e.target.value })} /></label>
              <label><span className="row spread"><span>Subtitle</span><Count v={c.subtitle} max={LIM.cardText} /></span><input value={c.subtitle ?? ""} onChange={(e) => patchCard(c.id, { subtitle: e.target.value })} /></label>
              <label>Image address (https)<input value={c.image ?? ""} onChange={(e) => patchCard(c.id, { image: e.target.value })} /></label>
              <label>Link when the card is tapped (https)<input value={c.url ?? ""} onChange={(e) => patchCard(c.id, { url: e.target.value })} /></label>
              <BtnEditor buttons={c.buttons} set={(buttons) => patchCard(c.id, { buttons })} />
            </div>
          ))}
          <button type="button" className="ghost small-btn" disabled={cards.length >= LIM.cards} onClick={() => set({ ...data, cards: [...cards, { id: newId(), title: "", buttons: [] }] })}>+ Add card</button>
        </>
      )}
      <p className="small muted" style={{ margin: 0 }}>Use {"{{name}}"} to insert an answer collected by a Question step.</p>
    </div>
  );
}

function QuestionPanel({ data, set }: { data: QuestionData; set: (d: QuestionData) => void }) {
  return (
    <div className="form">
      <h3 style={{ margin: 0 }}>Question</h3>
      <label><span className="row spread"><span>Question</span><Count v={data.text} max={LIM.text} /></span><textarea rows={3} value={data.text} onChange={(e) => set({ ...data, text: e.target.value })} /></label>
      <label>Save the answer as (optional)
        <input value={data.saveAs ?? ""} placeholder="name" maxLength={30} onChange={(e) => set({ ...data, saveAs: e.target.value })} />
      </label>
      <p className="small muted" style={{ margin: 0 }}>Later messages can show it with {"{{" + (data.saveAs || "name") + "}}"}.</p>
      <div className="small muted">Quick answers (optional, up to {LIM.choices}). Each one gets its own connection.</div>
      {data.choices.map((c) => (
        <div key={c.id} className="row" style={{ flexWrap: "nowrap" }}>
          <input value={c.title} placeholder="Answer text" onChange={(e) => set({ ...data, choices: data.choices.map((x) => (x.id === c.id ? { ...x, title: e.target.value } : x)) })} />
          <Count v={c.title} max={LIM.title} />
          <button type="button" className="ghost small-btn" onClick={() => set({ ...data, choices: data.choices.filter((x) => x.id !== c.id) })}>×</button>
        </div>
      ))}
      <button type="button" className="ghost small-btn" disabled={data.choices.length >= LIM.choices} onClick={() => set({ ...data, choices: [...data.choices, { id: newId(), title: "" }] })}>+ Add quick answer</button>
      <p className="small muted" style={{ margin: 0 }}>Whatever the person types is also accepted as the answer and follows &quot;Any other answer&quot;.</p>
    </div>
  );
}
