// Pure rules behind the automation: follow-up timing, brief -> client fields, and the scheduled prompts.
import assert from "node:assert";
import { nextStep, stepTexts, UNDELIVERED } from "./followup.ts";
import { clientFieldsFromBrief } from "./brief.ts";
import { briefsPrompt, guidelinesPrompt, outreachPrompt } from "./prompts.ts";

const now = Date.UTC(2026, 10, 20), day = 864e5;
const sent = (daysAgo: number) => ({ dmSentAt: new Date(now - daysAgo * day), status: "DM Sent" });
const S = [1, 2, 5, 10], ago = (d: number) => new Date(now - d * day);
assert.equal(nextStep(sent(1), 0, undefined, now, S), 0); // day 1: first follow-up
assert.equal(nextStep(sent(0.9), 0, undefined, now, S), -1); // too early
assert.equal(nextStep(sent(2), 1, ago(1), now, S), 1); // day 2, follow-up 1 went out 24h ago
assert.equal(nextStep(sent(2), 1, ago(0.5), now, S), -1); // never two within 24h
assert.equal(nextStep(sent(4), 2, ago(2), now, S), -1); // day 5 not reached yet
assert.equal(nextStep(sent(5), 2, ago(3), now, S), 2); // day 5
assert.equal(nextStep(sent(10), 3, ago(5), now, S), 3); // day 10 = the last one
assert.equal(nextStep(sent(30), 4, ago(20), now, S), -1); // all 4 used: stop
assert.equal(nextStep(sent(3), 0, undefined, now, S), 0); // after downtime it catches up one step at a time (the 24h rule spaces the rest)
assert.equal(nextStep({ ...sent(5), status: "Replied" }, 0, undefined, now, S), -1); // they replied
assert.equal(nextStep({ ...sent(5), needsHuman: { reason: "x", at: new Date() } }, 0, undefined, now, S), -1); // escalated: hands off
assert.equal(nextStep(sent(30), 0, undefined, now, []), -1); // empty schedule turns it off
assert.equal(nextStep({ status: "DM Sent" }, 0, undefined, now, S), -1); // never sent
assert.deepEqual(stepTexts("a\n---\n b \n----\n\nc"), ["a", "b", "c"]); // texts split on a --- line
assert.deepEqual(stepTexts("just one"), ["just one"]); // old single follow-up = step 1 only
assert.equal(stepTexts(undefined).length, 4); // no text of its own = the 4 default follow-ups (on by default)
assert.equal(stepTexts("  ").length, 4);
assert.deepEqual(stepTexts("None"), []); // opt out per client
for (const t of ["This account can’t receive your message", "Message not delivered", "Couldn't send", "can't receive your message"]) assert.ok(UNDELIVERED.test(t), t);
assert.equal(UNDELIVERED.test("no Message button on the profile"), false); // only real delivery failures count

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

for (const [kind, p] of [["briefs", briefsPrompt], ["outreach", outreachPrompt]] as const) {
  const t = p("https://app.example", "k-123");
  assert.match(t, /App: https:\/\/app\.example\nAPI key: k-123/, kind);
  assert.ok(t.includes(`POST /api/run/start {"kind":"${kind}"}`), kind);
  assert.ok(t.includes("POST /api/run/end"), kind);
  assert.ok(t.includes("POST /api/pause"), kind);
  assert.ok(t.includes("Read pages as text first"), `${kind} must default to cheap text reads over screenshots`);
}
const g = guidelinesPrompt("u", "k");
assert.ok(g.includes("POST /api/deals/run") && !g.includes("/api/run/start"), "guidelines run uses no Instagram lock");
assert.ok(!briefsPrompt("u", "k").includes("/api/outreach {"), "briefs run must never queue DMs");
const o = outreachPrompt("u", "k");
assert.ok(o.includes('"error":"creator replied"'), "follow-up must check for a reply first");
assert.ok(o.indexOf("PART A") < o.indexOf("PART B") && o.indexOf("PART B") < o.lastIndexOf("POST /api/run/end"), "replies must run before sends, and the run ends once at the end of both");
console.log("automation ok");
