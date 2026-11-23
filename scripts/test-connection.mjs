// Adds (or removes) a FAKE Instagram connection on an organization, so the chat-bot builder can be tried without a Meta app.
//   node --env-file=.env.local --experimental-strip-types scripts/test-connection.mjs                 -> only lists the organizations
//   node --env-file=.env.local --experimental-strip-types scripts/test-connection.mjs "Org name"      -> adds the test account
//   node --env-file=.env.local --experimental-strip-types scripts/test-connection.mjs "Org name" remove -> removes it and its flows
// The connection is flagged test:true: it holds no real token and the bot engine never sends anything through it. Reports show made-up demo numbers for it,
// and three sample chat-bot flows are added (once) so the builder has something to open.
import { MongoClient } from "mongodb";
import { parseFlow } from "../lib/botflow.ts";
import { seal } from "../lib/secrets.ts";

const [name, action] = process.argv.slice(2);

// Sample flows: a price enquiry (buttons, carousel, question with quick answer), a welcome catch-all, and a collab enquiry. Validated with the same rules the editor uses.
const n = (id, x, y, type, data) => ({ id, x, y, type, data });
const DEMO_FLOWS = [
  { name: "Price enquiry", enabled: true,
    nodes: [
      n("start", 40, 60, "trigger", { keywords: ["price", "cost", "how much"] }),
      n("menu", 330, 60, "message", { kind: "buttons", text: "Hi! Happy to help. What would you like to see?", buttons: [{ id: "bskin", title: "Skincare" }, { id: "bhair", title: "Haircare" }, { id: "bsite", title: "Visit our site", url: "https://example.com/shop" }] }),
      n("cards", 650, 20, "message", { kind: "carousel", cards: [
        { id: "c1", title: "Glow Serum", subtitle: "Rs 899 · vitamin C", image: "https://example.com/serum.jpg", url: "https://example.com/serum", buttons: [{ id: "c1b", title: "Buy now", url: "https://example.com/serum" }] },
        { id: "c2", title: "Night Cream", subtitle: "Rs 1,099 · retinol", image: "https://example.com/cream.jpg", url: "https://example.com/cream", buttons: [{ id: "c2b", title: "Buy now", url: "https://example.com/cream" }] },
        { id: "c3", title: "Daily Sunscreen", subtitle: "Rs 649 · SPF 50", image: "https://example.com/spf.jpg", buttons: [{ id: "c3b", title: "Tell me more" }] }] }),
      n("hair", 650, 330, "message", { kind: "text", text: "Our haircare range launches next month. Want early access?" }),
      n("ask", 980, 20, "question", { text: "Want a 10% discount code? Tell us your name.", saveAs: "name", choices: [{ id: "no", title: "Not now" }] }),
      n("thanks", 1290, 0, "message", { kind: "text", text: "Thanks {{name}}! Your code is HAV10. Valid for 7 days." }),
      n("later", 1290, 220, "message", { kind: "text", text: "No problem, message us any time." }),
      n("spf", 980, 300, "message", { kind: "image", text: "Lightweight, no white cast:", image: "https://example.com/spf-detail.jpg" }),
    ],
    edges: [
      { id: "e1", from: "start", port: "out", to: "menu" }, { id: "e2", from: "menu", port: "btn:bskin", to: "cards" }, { id: "e3", from: "menu", port: "btn:bhair", to: "hair" },
      { id: "e4", from: "cards", port: "out", to: "ask" }, { id: "e5", from: "cards", port: "btn:c3b", to: "spf" }, { id: "e6", from: "ask", port: "out", to: "thanks" }, { id: "e7", from: "ask", port: "choice:no", to: "later" },
    ] },
  { name: "Welcome (every message)", enabled: true,
    nodes: [n("start", 40, 60, "trigger", { keywords: [] }), n("hi", 330, 60, "message", { kind: "text", text: "Hi! Thanks for messaging us. Ask about prices, or type collab to work with us." })],
    edges: [{ id: "e1", from: "start", port: "out", to: "hi" }] },
  { name: "Collab enquiry", enabled: false,
    nodes: [n("start", 40, 60, "trigger", { keywords: ["collab", "partnership", "brand deal"] }), n("q", 330, 60, "question", { text: "Love to hear it! What is your Instagram handle?", saveAs: "handle", choices: [] }), n("done", 650, 60, "message", { kind: "text", text: "Got it, {{handle}}. Our team will reach out within 2 working days." })],
    edges: [{ id: "e1", from: "start", port: "out", to: "q" }, { id: "e2", from: "q", port: "out", to: "done" }] },
];
for (const f of DEMO_FLOWS) { const r = parseFlow(f); if (r.errors.length) throw new Error(`demo flow "${f.name}" is invalid: ${r.errors.join("; ")}`); }
const c = await new MongoClient(process.env.MONGODB_URI).connect(), d = c.db();
console.log(`database: ${d.databaseName}`);
const orgs = await d.collection("orgs").find().sort({ name: 1 }).toArray();
const conns = await d.collection("botConnections").find().toArray();
for (const o of orgs) console.log(`  org "${o.name}"  connections: ${conns.filter((x) => String(x.orgId) === String(o._id)).map((x) => `@${x.username}${x.test ? " (test)" : ""}`).join(", ") || "none"}`);
if (!orgs.length) console.log("  (no organizations yet: add one on the Organizations page first)");

if (name) {
  const org = orgs.find((o) => o.name.toLowerCase() === name.toLowerCase());
  if (!org) console.log(`\nNo organization named "${name}". Use one of the names above.`);
  else if (action === "remove") {
    const igId = `test-${org._id}`, flows = await d.collection("botFlows").deleteMany({ igId });
    const r = await d.collection("botConnections").deleteOne({ igId, test: true });
    console.log(`\nremoved ${r.deletedCount} test connection and ${flows.deletedCount} of its flows from "${org.name}"`);
  } else {
    await d.collection("botConnections").updateOne({ igId: `test-${org._id}` }, { $set: { orgId: org._id, username: "test_account", token: seal("TEST-ONLY-NOT-A-REAL-TOKEN"), connectedAt: new Date(), subscribed: false, test: true }, $unset: { lastError: "" } }, { upsert: true });
    const igId = `test-${org._id}`, have = new Set((await d.collection("botFlows").find({ igId }).toArray()).map((f) => f.name)), now = new Date();
    const fresh = DEMO_FLOWS.filter((f) => !have.has(f.name));
    if (fresh.length) await d.collection("botFlows").insertMany(fresh.map((f, i) => ({ orgId: org._id, igId, name: f.name, enabled: f.enabled, nodes: f.nodes, edges: f.edges, createdAt: new Date(+now + i), updatedAt: now })));
    console.log(`\nadded test connection @test_account to "${org.name}" (Reports show demo data for it) and ${fresh.length} sample flow${fresh.length === 1 ? "" : "s"}${have.size ? `, ${have.size} already there` : ""}.`);
  }
}
await c.close();
