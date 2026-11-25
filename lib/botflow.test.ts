import assert from "node:assert";
import { buildMessages, fill, matchFlow, nextNode, parseFlow, parsePayload, payload, portsOf, starterFlow, type BotNode, type Flow } from "./botflow.ts";

const FID = "a".repeat(24);
const ok = (f: unknown) => { const r = parseFlow(f); assert.deepEqual(r.errors, [], r.errors.join("; ")); return r.flow; };
const bad = (f: unknown, re: RegExp) => { const r = parseFlow(f); assert.ok(r.errors.some((e) => re.test(e)), `expected ${re} in: ${r.errors.join(" | ")}`); };

// the starter flow is valid
const s = ok(starterFlow());
assert.equal(nextNode(s, "start", "out"), "hello");

const trig: BotNode = { id: "t", type: "trigger", x: 0, y: 0, data: { keywords: [] } };
const flow = (...nodes: BotNode[]): Flow => ({ nodes: [trig, ...nodes], edges: [] });
const msg = (id: string, data: object): BotNode => ({ id, type: "message", x: 0, y: 0, data: { kind: "text", ...data } } as BotNode);

// ---- validation ----
bad({ nodes: [] }, /exactly one trigger/);
bad({ nodes: [trig, { ...trig, id: "t2" }] }, /exactly one trigger/);
bad(flow(msg("m", { text: "" })), /write the message/);
bad(flow(msg("m", { text: "x".repeat(1001) })), /write the message/);
bad(flow(msg("m", { kind: "image", image: "http://insecure.example/a.png" })), /https/);
bad(flow(msg("m", { kind: "buttons", text: "pick", buttons: [] })), /at least one button/);
bad(flow(msg("m", { kind: "buttons", text: "pick", buttons: [1, 2, 3, 4].map((i) => ({ id: `b${i}`, title: `B${i}` })) })), /at most 3 buttons/);
bad(flow(msg("m", { kind: "buttons", text: "pick", buttons: [{ id: "b1", title: "x".repeat(21) }] })), /1-20 characters/);
bad(flow(msg("m", { kind: "carousel", cards: [] })), /1-10 cards/);
bad(flow(msg("m", { kind: "carousel", cards: [{ id: "c1", title: "Only a title", buttons: [] }] })), /besides its title/);
bad(flow({ id: "q", type: "question", x: 0, y: 0, data: { text: "Name?", saveAs: "bad name!", choices: [] } } as BotNode), /save answer as/);
bad(flow({ id: "q", type: "question", x: 0, y: 0, data: { text: "Pick", choices: [{ id: "a", title: "Yes" }, { id: "b", title: "yes" }] } } as BotNode), /same text/);
bad({ nodes: [trig, msg("m", { text: "hi" })], edges: [{ id: "e", from: "t", port: "out", to: "nope" }] }, /does not exist/);
bad({ nodes: [trig, msg("m", { text: "hi" })], edges: [{ id: "e", from: "m", port: "out", to: "t" }] }, /does not exist/); // nothing connects into the trigger
bad({ nodes: [trig, msg("m", { text: "hi" })], edges: [{ id: "e", from: "t", port: "btn:zzz", to: "m" }] }, /does not exist/);
assert.deepEqual(parseFlow("junk").flow.nodes, []); // junk in, empty out, no crash
// a good carousel + buttons + question flow
const rich = ok({
  nodes: [
    trig,
    msg("m1", { kind: "buttons", text: "What next?", buttons: [{ id: "b1", title: "Shop" }, { id: "b2", title: "Site", url: "https://example.com" }] }),
    msg("m2", { kind: "carousel", cards: [{ id: "c1", title: "Serum", subtitle: "Glow", image: "https://example.com/a.jpg", url: "https://example.com/p", buttons: [{ id: "b3", title: "Buy", url: "https://example.com/buy" }, { id: "b4", title: "More" }] }] }),
    { id: "q1", type: "question", x: 0, y: 0, data: { text: "Your name?", saveAs: "name", choices: [{ id: "k1", title: "Skip" }] } } as BotNode,
  ],
  edges: [{ id: "e1", from: "t", port: "out", to: "m1" }, { id: "e2", from: "m1", port: "btn:b1", to: "m2" }, { id: "e3", from: "m2", port: "btn:b4", to: "q1" }, { id: "e4", from: "q1", port: "choice:k1", to: "m1" }],
});
assert.deepEqual(portsOf(rich.nodes[1]), ["out", "btn:b1"]); // the link button has no connection point
assert.deepEqual(portsOf(rich.nodes[2]), ["out", "btn:b4"]);
assert.deepEqual(portsOf(rich.nodes[3]), ["out", "choice:k1"]);

// ---- matching ----
const F = (id: string, keywords: string[]) => ({ id, nodes: [{ ...trig, data: { keywords } } as BotNode], edges: [] });
const flows = [F("all", []), F("price", ["price", "cost"]), F("pricelist", ["price list"])];
assert.equal(matchFlow(flows, "What is the PRICE?")!.id, "price");
assert.equal(matchFlow(flows, "send the price   list please")!.id, "pricelist"); // most specific keyword wins
assert.equal(matchFlow(flows, "hello there")!.id, "all"); // empty trigger answers everything else
assert.equal(matchFlow(flows.slice(1), "hello there"), undefined); // no catch-all, no match: stay silent

// ---- variables + payloads ----
assert.equal(fill("Hi {{ name }}, {{missing}}!", { name: "Asha" }), "Hi Asha, !");
const p = payload("b", FID, "m1", "b1");
assert.deepEqual(parsePayload(p), { kind: "b", flowId: FID, nodeId: "m1", itemId: "b1" });
assert.equal(parsePayload("b:short:x:y"), null);
assert.equal(parsePayload("<script>"), null);
assert.equal(parsePayload(undefined), null);

// ---- the exact Meta message shapes ----
const [t] = buildMessages(rich.nodes[1], {}, FID);
assert.deepEqual(t, { attachment: { type: "template", payload: { template_type: "button", text: "What next?", buttons: [{ type: "postback", title: "Shop", payload: `b:${FID}:m1:b1` }, { type: "web_url", url: "https://example.com", title: "Site" }] } } });
const [g] = buildMessages(rich.nodes[2], {}, FID) as { attachment: { payload: { elements: Record<string, unknown>[] } } }[];
assert.equal(g.attachment.payload.elements[0].image_url, "https://example.com/a.jpg");
assert.deepEqual(g.attachment.payload.elements[0].default_action, { type: "web_url", url: "https://example.com/p" });
assert.equal((g.attachment.payload.elements[0].buttons as unknown[]).length, 2);
const [qm] = buildMessages(rich.nodes[3], { x: "1" }, FID);
assert.deepEqual(qm, { text: "Your name?", quick_replies: [{ content_type: "text", title: "Skip", payload: `q:${FID}:q1:k1` }] });
assert.deepEqual(buildMessages(msg("i", { kind: "image", image: "https://example.com/i.png", text: "Look {{n}}" }), { n: "here" }, FID), [{ text: "Look here" }, { attachment: { type: "image", payload: { url: "https://example.com/i.png" } } }]);
assert.deepEqual(buildMessages(msg("i", { text: "Hi {{n}}" }), { n: "Asha" }, FID), [{ text: "Hi Asha" }]);
console.log("botflow ok");
