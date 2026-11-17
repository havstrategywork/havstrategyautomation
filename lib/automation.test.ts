// Pure rules behind the automation: follow-up timing, brief -> client fields, and the scheduled prompts.
import assert from "node:assert";
import { dueForFollowUp } from "./followup.ts";
import { clientFieldsFromBrief } from "./brief.ts";
import { briefsPrompt, repliesPrompt, sendPrompt } from "./prompts.ts";

const now = Date.UTC(2026, 10, 20), day = 864e5;
const sent = (daysAgo: number) => ({ dmSentAt: new Date(now - daysAgo * day), status: "DM Sent" });
assert.equal(dueForFollowUp(sent(3), now, 3), true); // exactly 3 days, no reply
assert.equal(dueForFollowUp(sent(2), now, 3), false); // too early
assert.equal(dueForFollowUp({ ...sent(5), status: "Replied" }, now, 3), false); // they replied
assert.equal(dueForFollowUp({ ...sent(5), followUpSentAt: new Date(now - day) }, now, 3), false); // only one follow-up ever
assert.equal(dueForFollowUp({ ...sent(5), needsHuman: { reason: "x", at: new Date() } }, now, 3), false); // escalated: hands off
assert.equal(dueForFollowUp(sent(30), now, 0), false); // FOLLOWUP_DAYS=0 turns it off
assert.equal(dueForFollowUp({ status: "DM Sent" }, now, 3), false); // never sent

const f = clientFieldsFromBrief({
  client: " Nuume ", currency: "INR", other: "", message: "Hi {{name}}!", followUp: "",
  products: [{ name: "Greens", about: "" }], rows: [{ tier: "Macro", count: 4, budget: 20000 }, { tier: "Micro", count: 2, budget: 10000 }],
});
assert.deepEqual(f.tierRates, { Micro: "10k INR", Macro: "20k INR" }); // exact per-tier budgets, as typed in the chat
assert.equal(f.maxRate, "20k INR");
assert.deepEqual([f.minFollowers, f.maxFollowers], [10000, 1000000]);
assert.equal(f.name, "Nuume");
assert.equal(f.dmTemplate, "Hi {{name}}!");
assert.equal("followUpTemplate" in f, false); // empty follow-up = none, not an empty template
assert.throws(() => clientFieldsFromBrief({ client: "x", currency: "INR", other: "", message: "", followUp: "", products: [], rows: [] }), /creator row/);

for (const [kind, p] of [["briefs", briefsPrompt], ["send", sendPrompt], ["replies", repliesPrompt]] as const) {
  const t = p("https://app.example", "k-123");
  assert.match(t, /App: https:\/\/app\.example\nAPI key: k-123/, kind);
  assert.ok(t.includes(`POST /api/run/start {"kind":"${kind}"}`), kind);
  assert.ok(t.includes("POST /api/run/end"), kind);
  assert.ok(t.includes("POST /api/pause"), kind);
}
assert.ok(!briefsPrompt("u", "k").includes("/api/outreach {"), "briefs run must never queue DMs");
assert.ok(sendPrompt("u", "k").includes('"error":"creator replied"'), "follow-up must check for a reply first");
console.log("automation ok");
