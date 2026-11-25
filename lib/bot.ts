// The bot runtime: turns a Meta webhook event into the flow's replies. No conversation log is kept; only a small session row while a question waits for its answer.
import { ObjectId } from "mongodb";
import { db, type BotConnection, type BotFlowDoc } from "./db";
import { buildMessages, matchFlow, nextNode, parsePayload, portsOf, triggerOf, type Vars } from "./botflow";
import { MetaError, sendMessage } from "./meta";
import { unseal } from "./secrets";

const MAX_STEPS = 20; // a loop in the flow can never send more than this per incoming message

type Ev = { sender?: { id?: string }; message?: { mid?: string; text?: string; is_echo?: boolean; quick_reply?: { payload?: string } }; postback?: { mid?: string; payload?: string } };
type Ctx = { conn: BotConnection; token: string; igsid: string; sid: string };

export async function handleWebhook(body: unknown) {
  const b = body as { object?: string; entry?: { id?: string; messaging?: Ev[] }[] };
  if (b?.object !== "instagram") return;
  for (const e of Array.isArray(b.entry) ? b.entry : []) for (const ev of Array.isArray(e.messaging) ? e.messaging : []) {
    try { await handleEvent(String(e.id ?? ""), ev); } catch (err) { console.error("bot event failed:", err instanceof Error ? err.message : "unknown"); }
  }
}

const flowById = async (id: ObjectId | string, igId: string) => {
  if (!ObjectId.isValid(String(id))) return null;
  return (await db()).botFlows.findOne({ _id: new ObjectId(String(id)), igId, enabled: true });
};

async function handleEvent(igId: string, ev: Ev) {
  const igsid = ev.sender?.id;
  if (!igId || !igsid || igsid === igId || ev.message?.is_echo) return; // never answer ourselves
  const { botConnections, botSeen, botSessions } = await db();
  const mid = ev.message?.mid ?? ev.postback?.mid;
  if (mid) { try { await botSeen.insertOne({ _id: mid, at: new Date() }); } catch (e) { if ((e as { code?: number }).code === 11000) return; throw e; } } // Meta retried: already handled
  const conn = await botConnections.findOne({ igId });
  if (!conn || conn.test) return; // a test connection is only for trying the builder
  let token: string;
  try { token = unseal(conn.token); } catch { return fail(conn, "The saved Meta token can no longer be read. Reconnect this account."); }
  const ctx: Ctx = { conn, token, igsid, sid: `${igId}:${igsid}` };
  const session = await botSessions.findOne({ _id: ctx.sid });
  const p = parsePayload(ev.message?.quick_reply?.payload ?? ev.postback?.payload);

  if (p) { // a button or quick reply from one of our messages
    const flow = await flowById(p.flowId, igId), node = flow?.nodes.find((n) => n.id === p.nodeId);
    if (!flow || !node) return;
    const vars: Vars = session && String(session.flowId) === String(flow._id) ? { ...session.vars } : {};
    if (p.kind === "b") { // button: only if that button exists and has a line leading somewhere
      const target = portsOf(node).includes(`btn:${p.itemId}`) ? nextNode(flow, node.id, `btn:${p.itemId}`) : undefined;
      return target ? run(ctx, flow, target, vars) : undefined;
    }
    const choice = node.type === "question" ? node.data.choices.find((c) => c.id === p.itemId) : undefined;
    if (node.type !== "question" || !choice) return;
    if (node.data.saveAs) vars[node.data.saveAs] = choice.title;
    return advance(ctx, flow, nextNode(flow, node.id, `choice:${choice.id}`) ?? nextNode(flow, node.id, "out"), vars);
  }

  const text = ev.message?.text;
  if (!text) return; // likes, photos, stickers: nothing to answer
  if (session) { // answering a question we asked
    const flow = await flowById(session.flowId, igId), node = flow?.nodes.find((n) => n.id === session.nodeId);
    if (flow && node?.type === "question") {
      const vars: Vars = { ...session.vars }, choice = node.data.choices.find((c) => c.title.toLowerCase() === text.trim().toLowerCase());
      if (node.data.saveAs) vars[node.data.saveAs] = text.trim().slice(0, 500);
      return advance(ctx, flow, (choice && nextNode(flow, node.id, `choice:${choice.id}`)) || nextNode(flow, node.id, "out"), vars);
    }
    await botSessions.deleteOne({ _id: ctx.sid }); // stale: the flow was switched off or edited
  }
  const flows = await (await db()).botFlows.find({ igId, enabled: true }).sort({ createdAt: 1 }).toArray(), flow = matchFlow(flows, text), trig = flow && triggerOf(flow);
  if (flow && trig) await advance(ctx, flow, nextNode(flow, trig.id, "out"), {});
}

const advance = async (ctx: Ctx, flow: BotFlowDoc, to: string | undefined, vars: Vars) => (to ? run(ctx, flow, to, vars) : (await db()).botSessions.deleteOne({ _id: ctx.sid }));

async function run(ctx: Ctx, flow: BotFlowDoc, from: string, vars: Vars) {
  const { botSessions } = await db();
  let id: string | undefined = from;
  try {
    for (let i = 0; id && i < MAX_STEPS; i++) {
      const node = flow.nodes.find((n) => n.id === id);
      if (!node) break;
      if (node.type !== "trigger") for (const m of buildMessages(node, vars, String(flow._id))) await sendMessage(ctx.conn.igId, ctx.token, ctx.igsid, m);
      if (node.type === "question") { await botSessions.updateOne({ _id: ctx.sid }, { $set: { flowId: flow._id!, nodeId: node.id, vars, at: new Date() } }, { upsert: true }); break; } // wait for the answer
      id = nextNode(flow, node.id, "out");
      if (!id) await botSessions.deleteOne({ _id: ctx.sid });
    }
    if (ctx.conn.lastError) await (await db()).botConnections.updateOne({ _id: ctx.conn._id }, { $unset: { lastError: "" } });
  } catch (e) {
    await fail(ctx.conn, e instanceof MetaError ? e.message : "Sending failed.");
  }
}

/** Remembered on the connection so the dashboard can show why replies stopped (expired token, 24h window, app not live...). */
const fail = async (conn: BotConnection, message: string) => { await (await db()).botConnections.updateOne({ _id: conn._id }, { $set: { lastError: { message: message.slice(0, 300), at: new Date() } } }); };
