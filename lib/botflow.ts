// Chat-bot flows for Instagram DMs. Pure (no DB, no network): the data model, validation of what the editor sends, keyword matching,
// and the exact JSON Meta's Messaging API wants for each message type. Limits are Meta's (button/quick-reply titles 20 chars, 3 buttons,
// 10 carousel cards, 13 quick replies, button-template text 640, card title/subtitle 80).
export type Btn = { id: string; title: string; url?: string }; // url = opens a link; no url = a reply button that continues along its own connection
export type Card = { id: string; title: string; subtitle?: string; image?: string; url?: string; buttons: Btn[] };
export type MessageData = { kind: "text" | "image" | "buttons" | "carousel"; text?: string; image?: string; buttons?: Btn[]; cards?: Card[] };
export type QuestionData = { text: string; saveAs?: string; choices: { id: string; title: string }[] };
export type TriggerData = { keywords: string[] }; // empty = reply to every message
export type BotNode = { id: string; x: number; y: number } & (
  | { type: "trigger"; data: TriggerData } | { type: "message"; data: MessageData } | { type: "question"; data: QuestionData });
export type BotEdge = { id: string; from: string; port: string; to: string }; // port: "out" | "btn:<id>" | "choice:<id>"
export type Flow = { nodes: BotNode[]; edges: BotEdge[] };
export type Vars = Record<string, string>;

export const LIM = { nodes: 60, text: 1000, buttonText: 640, title: 20, cardText: 80, buttons: 3, cards: 10, choices: 13, keywords: 30, keywordLen: 60 } as const;
const ID = /^[A-Za-z0-9_-]{1,24}$/, HTTPS = /^https:\/\/[^\s]{3,2000}$/i, VAR = /^\w{1,30}$/;

/** The connection points a node offers: where lines can start. */
export function portsOf(n: BotNode): string[] {
  if (n.type === "trigger") return ["out"];
  if (n.type === "question") return ["out", ...n.data.choices.map((c) => `choice:${c.id}`)];
  const btns = [...(n.data.buttons ?? []), ...(n.data.cards ?? []).flatMap((c) => c.buttons)].filter((b) => !b.url);
  return ["out", ...btns.map((b) => `btn:${b.id}`)];
}
export const nextNode = (f: Flow, from: string, port: string) => f.edges.find((e) => e.from === from && e.port === port)?.to;

// ---- parsing what the editor sends (never trust it) ----
type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const btn = (v: unknown): Btn => { const o = obj(v), url = str(o.url); return { id: str(o.id), title: str(o.title), ...(url && { url }) }; };

/** Coerces untrusted JSON into a Flow (wrong types become empty values) and returns every rule it breaks. No silent truncation: a too-long text is an error. */
export function parseFlow(raw: unknown): { flow: Flow; errors: string[] } {
  const o = obj(raw), errors: string[] = [], err = (m: string) => errors.push(m);
  const nodes: BotNode[] = list(o.nodes).slice(0, LIM.nodes + 1).map((x) => {
    const n = obj(x), d = obj(n.data), base = { id: str(n.id), x: Math.round(Number(n.x) || 0), y: Math.round(Number(n.y) || 0) };
    if (n.type === "trigger") return { ...base, type: "trigger", data: { keywords: list(d.keywords).map(str).filter(Boolean) } } as BotNode;
    if (n.type === "question") return { ...base, type: "question", data: { text: str(d.text), ...(str(d.saveAs) && { saveAs: str(d.saveAs) }), choices: list(d.choices).map((c) => ({ id: str(obj(c).id), title: str(obj(c).title) })) } } as BotNode;
    const kind = ["text", "image", "buttons", "carousel"].includes(String(d.kind)) ? (d.kind as MessageData["kind"]) : "text";
    return { ...base, type: "message", data: { kind, text: str(d.text), image: str(d.image), buttons: list(d.buttons).map(btn), cards: list(d.cards).map((c) => { const k = obj(c); return { id: str(k.id), title: str(k.title), subtitle: str(k.subtitle), image: str(k.image), url: str(k.url), buttons: list(k.buttons).map(btn) }; }) } } as BotNode;
  });
  const edges: BotEdge[] = list(o.edges).slice(0, 400).map((x) => { const e = obj(x); return { id: str(e.id), from: str(e.from), port: str(e.port), to: str(e.to) }; });
  const flow: Flow = { nodes, edges };

  if (nodes.length > LIM.nodes) err(`At most ${LIM.nodes} steps per flow.`);
  if (nodes.filter((n) => n.type === "trigger").length !== 1) err("A flow needs exactly one trigger.");
  const ids = new Set<string>();
  for (const n of nodes) {
    if (!ID.test(n.id) || ids.has(n.id)) { err("Internal error: a step has a missing or duplicate id. Reload the editor."); continue; }
    ids.add(n.id);
    const at = `${n.type === "trigger" ? "Trigger" : n.type === "question" ? "Question" : "Message"} "${n.id}"`;
    const inner = new Set<string>(), uniq = (id: string) => { if (!ID.test(id) || inner.has(id)) err(`${at}: a button has a missing or duplicate id. Reload the editor.`); inner.add(id); };
    const url = (u: string | undefined, what: string) => { if (u && !HTTPS.test(u)) err(`${at}: ${what} must be a full https:// address.`); };
    const buttons = (bs: Btn[], where: string) => { if (bs.length > LIM.buttons) err(`${at}: ${where} can have at most ${LIM.buttons} buttons.`); for (const b of bs) { uniq(b.id); if (!b.title || b.title.length > LIM.title) err(`${at}: a button title must be 1-${LIM.title} characters.`); url(b.url, `the link of "${b.title}"`); } };
    if (n.type === "trigger") {
      if (n.data.keywords.length > LIM.keywords || n.data.keywords.some((k) => k.length > LIM.keywordLen)) err(`${at}: at most ${LIM.keywords} keywords, each up to ${LIM.keywordLen} characters.`);
    } else if (n.type === "question") {
      const d = n.data;
      if (!d.text || d.text.length > LIM.text) err(`${at}: the question text is required (up to ${LIM.text} characters).`);
      if (d.saveAs && !VAR.test(d.saveAs)) err(`${at}: "save answer as" may only use letters, numbers and _ (up to 30).`);
      if (d.choices.length > LIM.choices) err(`${at}: at most ${LIM.choices} answer choices.`);
      for (const c of d.choices) { uniq(c.id); if (!c.title || c.title.length > LIM.title) err(`${at}: a choice must be 1-${LIM.title} characters.`); }
      if (new Set(d.choices.map((c) => c.title.toLowerCase())).size !== d.choices.length) err(`${at}: two choices have the same text.`);
    } else {
      const d = n.data;
      if (d.kind === "text" && (!d.text || d.text.length > LIM.text)) err(`${at}: write the message (up to ${LIM.text} characters).`);
      if (d.kind === "image") { if (!d.image) err(`${at}: add the image address.`); url(d.image, "the image address"); if ((d.text ?? "").length > LIM.text) err(`${at}: the text is too long.`); }
      if (d.kind === "buttons") { if (!d.text || d.text.length > LIM.buttonText) err(`${at}: write the message above the buttons (up to ${LIM.buttonText} characters).`); if (!d.buttons?.length) err(`${at}: add at least one button.`); buttons(d.buttons ?? [], "a message"); }
      if (d.kind === "carousel") {
        const cards = d.cards ?? [];
        if (!cards.length || cards.length > LIM.cards) err(`${at}: a carousel needs 1-${LIM.cards} cards.`);
        for (const c of cards) {
          uniq(c.id);
          if (!c.title || c.title.length > LIM.cardText) err(`${at}: every card needs a title (up to ${LIM.cardText} characters).`);
          if ((c.subtitle ?? "").length > LIM.cardText) err(`${at}: a card subtitle is up to ${LIM.cardText} characters.`);
          if (!c.image && !c.subtitle && !c.url && !c.buttons.length) err(`${at}: card "${c.title}" needs an image, subtitle, link or button besides its title.`);
          url(c.image, `the image of card "${c.title}"`); url(c.url, `the link of card "${c.title}"`); buttons(c.buttons, `card "${c.title}"`);
        }
      }
    }
  }
  const seen = new Set<string>();
  for (const e of edges) {
    const from = nodes.find((n) => n.id === e.from), to = nodes.find((n) => n.id === e.to), key = `${e.from}|${e.port}`;
    if (!from || !to || !portsOf(from).includes(e.port) || to.type === "trigger" || e.from === e.to || seen.has(key)) { err("Internal error: a connection points at something that does not exist. Reload the editor."); continue; }
    seen.add(key);
  }
  return { flow, errors };
}

// ---- running ----
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
export const triggerOf = (f: Flow) => f.nodes.find((n) => n.type === "trigger") as Extract<BotNode, { type: "trigger" }> | undefined;

/** Flows with keywords win (the longest matching keyword is the most specific); otherwise the first flow with an empty trigger answers everything. Input order = priority. */
export function matchFlow<T extends Flow>(flows: T[], text: string): T | undefined {
  const t = norm(text);
  let best: { f: T; len: number } | undefined, catchAll: T | undefined;
  for (const f of flows) {
    const kws = (triggerOf(f)?.data.keywords ?? []).map(norm).filter(Boolean);
    if (!kws.length) { catchAll ??= f; continue; }
    for (const k of kws) if (t.includes(k) && (!best || k.length > best.len)) best = { f, len: k.length };
  }
  return best?.f ?? catchAll;
}

/** Fills {{name}} from the answers collected so far. An unknown name becomes empty rather than showing the braces. */
export const fill = (text: string, vars: Vars) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");

export type Payload = { kind: "b" | "q"; flowId: string; nodeId: string; itemId: string };
export const payload = (kind: Payload["kind"], flowId: string, nodeId: string, itemId: string) => `${kind}:${flowId}:${nodeId}:${itemId}`;
export function parsePayload(p: unknown): Payload | null {
  const m = typeof p === "string" && /^(b|q):([a-f0-9]{24}):([\w-]{1,24}):([\w-]{1,24})$/.exec(p);
  return m ? { kind: m[1] as Payload["kind"], flowId: m[2], nodeId: m[3], itemId: m[4] } : null;
}

export type GraphMessage = Record<string, unknown>;
const toButton = (b: Btn, flowId: string, nodeId: string) => (b.url ? { type: "web_url", url: b.url, title: b.title } : { type: "postback", title: b.title, payload: payload("b", flowId, nodeId, b.id) });

/** The message(s) a step sends, shaped for POST /<IG_ID>/messages. */
export function buildMessages(n: BotNode, vars: Vars, flowId: string): GraphMessage[] {
  if (n.type === "question") {
    const q = n.data;
    return [{ text: fill(q.text, vars), ...(q.choices.length && { quick_replies: q.choices.map((c) => ({ content_type: "text", title: c.title, payload: payload("q", flowId, n.id, c.id) })) }) }];
  }
  if (n.type !== "message") return [];
  const d = n.data, f = (s?: string) => fill(s ?? "", vars);
  const template = (p: Record<string, unknown>) => ({ attachment: { type: "template", payload: p } });
  if (d.kind === "text") return [{ text: f(d.text) }];
  if (d.kind === "image") return [...(d.text ? [{ text: f(d.text) }] : []), { attachment: { type: "image", payload: { url: d.image } } }];
  if (d.kind === "buttons") return [template({ template_type: "button", text: f(d.text), buttons: (d.buttons ?? []).map((b) => toButton(b, flowId, n.id)) })];
  return [template({
    template_type: "generic",
    elements: (d.cards ?? []).map((c) => ({
      title: f(c.title), ...(c.subtitle && { subtitle: f(c.subtitle) }), ...(c.image && { image_url: c.image }),
      ...(c.url && { default_action: { type: "web_url", url: c.url } }), ...(c.buttons.length && { buttons: c.buttons.map((b) => toButton(b, flowId, n.id)) }),
    })),
  })];
}

export const newId = () => Math.random().toString(36).slice(2, 10);
/** A new flow: just a trigger that replies to everything, connected to a first message. */
export const starterFlow = (): Flow => ({
  nodes: [
    { id: "start", type: "trigger", x: 40, y: 60, data: { keywords: [] } },
    { id: "hello", type: "message", x: 360, y: 60, data: { kind: "text", text: "Hi! Thanks for messaging us." } },
  ],
  edges: [{ id: "e1", from: "start", port: "out", to: "hello" }],
});
