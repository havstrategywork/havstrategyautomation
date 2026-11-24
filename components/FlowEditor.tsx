"use client";
// Drag-and-drop flow canvas: an infinite, pannable and zoomable board. Steps are boxes you drag by their header; drag from a round dot on the right of a row to another box to connect them.
// No graph library: positions of the dots are measured from the DOM (in world coordinates) and the lines are SVG curves. Everything the editor sends is re-validated on the server.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Select from "@/components/mui/Select";
import { LIM, newId, portsOf, type Btn, type BotEdge, type BotNode, type Card, type Flow, type MessageData, type QuestionData, type TriggerData } from "@/lib/botflow";
import { boundsOf, fitView, toWorld, zoomAt, type View } from "@/lib/flowview";

type Save = (id: string, flow: Flow) => Promise<{ ok: boolean; errors: string[] }>;
type Sel = { kind: "node" | "edge"; id: string } | null;
const W = 250, GRID = 22;

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
const PANEL_KEY = "flow-panel-open";

/** `lead` = what the page puts at the start of the top bar (back link, name, on/off), so the editor needs no header of its own. */
export default function FlowEditor({ id, initial, save, lead }: { id: string; initial: Flow; save: Save; lead?: ReactNode }) {
  const [flow, setFlow] = useState<Flow>(initial);
  const [sel, setSel] = useState<Sel>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error"; errors?: string[] }>({ kind: "idle" });
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const [drag, setDrag] = useState<{ from: string; port: string; x: number; y: number } | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 });
  const [ready, setReady] = useState(false); // hidden until the first "fit", so the board never flashes at the wrong place
  const [full, setFull] = useState(false);
  const [open, setOpen] = useState(true); // the floating panel inside the canvas
  const [fonts, setFonts] = useState(0);
  const inner = useRef<HTMLDivElement>(null), wrap = useRef<HTMLDivElement>(null);
  const moving = useRef<{ id: string; px: number; py: number; nx: number; ny: number } | null>(null);
  const pan = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);

  const edit = (fn: (f: Flow) => Flow) => { setFlow((f) => prune(fn(f))); setDirty(true); setStatus({ kind: "idle" }); };
  const setData = (nodeId: string, data: BotNode["data"]) => edit((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === nodeId ? ({ ...n, data } as BotNode) : n)) }));
  const node = sel?.kind === "node" ? flow.nodes.find((n) => n.id === sel.id) : undefined;
  const size = () => ({ w: wrap.current?.clientWidth ?? 0, h: wrap.current?.clientHeight ?? 0 });

  const fit = () => {
    const el = inner.current; if (!el) return;
    const b = boundsOf(flow.nodes.map((n) => ({ x: n.x, y: n.y, w: W, h: el.querySelector<HTMLElement>(`[data-node="${n.id}"]`)?.offsetHeight ?? 160 })));
    const s = size(), room = open && s.w > 800 ? 360 : 0; // keep the open panel (340px wide) from covering the steps
    if (b) setView(fitView(b, { w: s.w - room, h: s.h }));
  };
  const zoomBy = (f: number) => { const s = size(); setView((v) => zoomAt(v, s.w / 2, s.h / 2, f)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { fit(); setReady(true); }, []);

  // measure every connection dot (in world coordinates, so panning and zooming don't matter), so lines can be drawn between them
  useLayoutEffect(() => {
    const el = inner.current; if (!el) return;
    const base = el.getBoundingClientRect(), z = view.z, next: Record<string, { x: number; y: number }> = {};
    el.querySelectorAll<HTMLElement>("[data-port],[data-in]").forEach((d) => { const r = d.getBoundingClientRect(); next[d.dataset.port ? `out:${d.dataset.port}` : `in:${d.dataset.in}`] = { x: (r.left - base.left + r.width / 2) / z, y: (r.top - base.top + r.height / 2) / z }; });
    setPos((p) => (JSON.stringify(p) === JSON.stringify(next) ? p : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, fonts]);
  useEffect(() => { document.fonts?.ready.then(() => setFonts((n) => n + 1)); }, []);

  useEffect(() => { try { if (localStorage.getItem(PANEL_KEY) === "0") setOpen(false); } catch { /* private mode: stays open */ } }, []);
  const togglePanel = () => setOpen((o) => { try { localStorage.setItem(PANEL_KEY, o ? "0" : "1"); } catch { /* not remembered */ } return !o; });
  useEffect(() => { if (sel) setOpen(true); }, [sel?.kind, sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- picking another step opens the panel so it can be edited

  useEffect(() => { // leaving with unsaved changes asks first
    const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  useEffect(() => { // wheel / trackpad scroll pans; ctrl+wheel or a trackpad pinch zooms around the pointer
    const el = wrap.current; if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) setView((v) => zoomAt(v, e.clientX - r.left, e.clientY - r.top, Math.exp(-Math.max(-40, Math.min(40, e.deltaY)) * 0.01)));
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", h, { passive: false }); return () => el.removeEventListener("wheel", h);
  }, []);

  useEffect(() => { // full screen: Esc leaves it
    if (!full) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [full]);

  useEffect(() => { // dragging a new connection: follow the pointer, connect on release over a box
    if (!drag) return;
    const move = (e: PointerEvent) => { const b = inner.current!.getBoundingClientRect(); setDrag((d) => d && { ...d, x: (e.clientX - b.left) / view.z, y: (e.clientY - b.top) / view.z }); };
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
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => { const m = moving.current; if (!m) return; edit((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === m.id ? { ...n, x: Math.round(m.nx + (e.clientX - m.px) / view.z), y: Math.round(m.ny + (e.clientY - m.py) / view.z) } : n)) })); };
  const startLink = (from: string, port: string) => (e: React.PointerEvent) => { e.stopPropagation(); e.preventDefault(); const b = inner.current!.getBoundingClientRect(); setDrag({ from, port, x: (e.clientX - b.left) / view.z, y: (e.clientY - b.top) / view.z }); };

  // dragging the empty board pans it
  const panStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || (e.button !== 0 && e.button !== 1)) return;
    e.currentTarget.setPointerCapture(e.pointerId); pan.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y }; setSel(null);
  };
  const panMove = (e: React.PointerEvent<HTMLDivElement>) => { const p = pan.current; if (p) setView((v) => ({ ...v, x: p.vx + e.clientX - p.px, y: p.vy + e.clientY - p.py })); };

  const add = (type: "message" | "question") => { // appears in the middle of what you're looking at
    const s = size(), c = toWorld(view, s.w / 2, s.h / 2), k = (flow.nodes.length % 6) * 24, nid = newId();
    const base = { id: nid, x: Math.round(c.x - W / 2 + k), y: Math.round(c.y - 60 + k) };
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

  const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => `M${a.x} ${a.y} C${a.x + 70} ${a.y} ${b.x - 70} ${b.y} ${b.x} ${b.y}`;

  return (
    <div className={`editor${full ? " full" : ""}`}>
      <div className="editor-bar">
        {lead}
        <span className="bar-sep" aria-hidden="true" />
        <button type="button" className="ghost small-btn" onClick={() => add("message")}>+ Message</button>
        <button type="button" className="ghost small-btn" onClick={() => add("question")}>+ Question</button>
        <button type="button" className="ghost small-btn" disabled={!sel || (sel.kind === "node" && node?.type === "trigger")} onClick={remove} style={{ color: "var(--bad)" }}>Delete {sel?.kind === "edge" ? "connection" : "step"}</button>
        <span style={{ flex: 1 }} />
        <span className="small muted" aria-live="polite">{status.kind === "saving" ? "Saving…" : status.kind === "saved" ? "Saved ✓" : dirty ? "Unsaved changes" : ""}</span>
        <button type="button" className="ghost small-btn" onClick={() => setFull((f) => !f)} aria-pressed={full}>{full ? "Exit full screen" : "Full screen"}</button>
        <button type="button" onClick={doSave} disabled={!dirty || status.kind === "saving"}>Save flow</button>
      </div>

      <div className="canvas-frame">
        <div
          className="canvas-wrap" ref={wrap} tabIndex={0}
          style={{ backgroundSize: `${GRID * view.z}px ${GRID * view.z}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
          onKeyDown={(e) => { if ((e.key === "Delete" || e.key === "Backspace") && !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) remove(); }}
          onPointerDown={panStart} onPointerMove={panMove} onPointerUp={() => (pan.current = null)} onPointerCancel={() => (pan.current = null)}
        >
          <div className="canvas" ref={inner} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, visibility: ready ? "visible" : "hidden" }}>
            <svg className="fedges" aria-hidden="true">
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

        {/* everything floating on top of the board lives here, so wheel/drag on it never moves the board */}
        <div className="canvas-ui">
          {status.kind === "error" && (
            <div className="notice canvas-err" role="alert">
              <div className="row spread"><b>Not saved</b><button type="button" className="ghost small-btn" aria-label="Dismiss" onClick={() => setStatus({ kind: "idle" })}>×</button></div>
              <ul style={{ margin: ".3rem 0 0", paddingLeft: "1.1rem" }}>{status.errors?.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}

          <div className="zoombar" role="group" aria-label="Zoom">
            <button type="button" className="ghost small-btn" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>−</button>
            <button type="button" className="ghost small-btn" aria-label="Reset zoom to 100%" onClick={() => zoomBy(1 / view.z)}>{Math.round(view.z * 100)}%</button>
            <button type="button" className="ghost small-btn" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>+</button>
            <button type="button" className="ghost small-btn" onClick={fit}>Fit</button>
          </div>

          <aside className={`insp${open ? "" : " closed"}`} aria-label="Step settings and help">
            <div className="insp-head">
              <b>{node ? title(node) : sel?.kind === "edge" ? "Connection" : "How it works"}</b>
              <button type="button" className="ghost small-btn" aria-expanded={open} aria-label={open ? "Collapse panel" : "Expand panel"} onClick={togglePanel}>{open ? "▾" : "▸"}</button>
            </div>
            {open && (
              <div className="insp-body">
                {!sel && (
                  <ul className="help small muted">
                    <li>Click a step to edit it. Drag it by its coloured header to move it.</li>
                    <li>To connect, drag from a round dot (&quot;Then&quot;, a button or an answer) onto another step.</li>
                    <li>Click a line, then Delete, to remove it.</li>
                    <li>Drag the background or scroll to move around. Ctrl + scroll, a pinch or the buttons bottom-left zoom.</li>
                  </ul>
                )}
                {sel?.kind === "edge" && <p className="small muted" style={{ margin: 0 }}>Press Delete, or use &quot;Delete connection&quot; above.</p>}
                {node?.type === "trigger" && <TriggerPanel data={node.data} set={(d) => setData(node.id, d)} />}
                {node?.type === "message" && <MessagePanel data={node.data} set={(d) => setData(node.id, d)} />}
                {node?.type === "question" && <QuestionPanel data={node.data} set={(d) => setData(node.id, d)} />}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

// ---- panel contents ----
const Count = ({ v, max }: { v?: string; max: number }) => <span className={`small ${(v?.length ?? 0) > max ? "" : "muted"}`} style={(v?.length ?? 0) > max ? { color: "var(--bad)" } : undefined}>{v?.length ?? 0}/{max}</span>;

function TriggerPanel({ data, set }: { data: TriggerData; set: (d: TriggerData) => void }) {
  const [text, setText] = useState(data.keywords.join(", "));
  return (
    <div className="form">
      <label>Keywords (separate with commas)
        <textarea rows={3} value={text} placeholder="price, cost, offer" onChange={(e) => { setText(e.target.value); set({ keywords: e.target.value.split(/[,\n]/).map((k) => k.trim()).filter(Boolean) }); }} />
      </label>
      <p className="small muted" style={{ margin: 0 }}>Starts when a message contains any of these. Empty = every message.</p>
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
      <p className="small muted" style={{ margin: 0 }}>Insert a saved answer with {"{{name}}"}.</p>
    </div>
  );
}

function QuestionPanel({ data, set }: { data: QuestionData; set: (d: QuestionData) => void }) {
  return (
    <div className="form">
      <label><span className="row spread"><span>Question</span><Count v={data.text} max={LIM.text} /></span><textarea rows={3} value={data.text} onChange={(e) => set({ ...data, text: e.target.value })} /></label>
      <label>Save the answer as (optional)
        <input value={data.saveAs ?? ""} placeholder="name" maxLength={30} onChange={(e) => set({ ...data, saveAs: e.target.value })} />
      </label>
      <p className="small muted" style={{ margin: 0 }}>Later messages can show it with {"{{" + (data.saveAs || "name") + "}}"}.</p>
      <div className="small muted">Quick answers (optional, up to {LIM.choices}), each with its own connection. Typed answers follow &quot;Any other answer&quot;.</div>
      {data.choices.map((c) => (
        <div key={c.id} className="row" style={{ flexWrap: "nowrap" }}>
          <input value={c.title} placeholder="Answer text" onChange={(e) => set({ ...data, choices: data.choices.map((x) => (x.id === c.id ? { ...x, title: e.target.value } : x)) })} />
          <Count v={c.title} max={LIM.title} />
          <button type="button" className="ghost small-btn" onClick={() => set({ ...data, choices: data.choices.filter((x) => x.id !== c.id) })}>×</button>
        </div>
      ))}
      <button type="button" className="ghost small-btn" disabled={data.choices.length >= LIM.choices} onClick={() => set({ ...data, choices: [...data.choices, { id: newId(), title: "" }] })}>+ Add quick answer</button>
    </div>
  );
}
