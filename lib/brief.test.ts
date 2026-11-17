import assert from "node:assert";
import { buildPrompt, cleanRows, money, tierRange } from "./brief.ts";

assert.equal(money(10000, "INR"), "10k INR");
assert.equal(money(12500, "INR"), "12,500 INR");
assert.equal(tierRange("Nano"), "under 10k");
assert.equal(tierRange("Micro"), "10k–100k");
assert.equal(tierRange("Mega"), "1M+");
// incomplete rows dropped, tiers sorted small -> big
assert.deepEqual(cleanRows([{ tier: "Macro", count: 4, budget: 20000 }, { tier: "Micro", count: 0, budget: 1 }, { tier: "Nano", count: 2, budget: 10000 }]).map((r) => r.tier), ["Nano", "Macro"]);

const p = buildPrompt({
  client: "Nuume", currency: "INR", other: "", message: "",
  products: [{ name: "Daily greens", about: "multivitamin + greens" }, { name: "FN-01 gummies", about: "" }, { name: " ", about: "ignored" }],
  rows: [{ tier: "Micro", count: 2, budget: 10000 }, { tier: "Macro", count: 4, budget: 20000 }],
}, "https://havstrategyautomation.vercel.app", "test-key-123");
assert.match(p, /PRODUCTS \(2\)/); // blank product skipped
assert.match(p, /\| Micro \| 10k–100k \| 2 \| 10k INR \|/);
assert.match(p, /tierRates = \{"Micro":"10k INR","Macro":"20k INR"\}/); // per-tier budgets, enforced by the server
assert.match(p, /maxRate = "20k INR"/);
assert.match(p, /minFollowers = 10000, maxFollowers = 1000000/);
assert.match(p, /Total: 6 creators, up to 100k INR/); // 2*10k + 4*20k
assert.match(p, /Micro 6, Macro 12/); // 3x contact factor
assert.match(p, /None given\. Draft one/); // no message -> draft for approval, never auto-send
assert.match(p, /App: https:\/\/havstrategyautomation\.vercel\.app\nAPI key: test-key-123\n/);
assert.match(buildPrompt({ client: "x", currency: "INR", other: "", message: "", products: [{ name: "p", about: "" }], rows: [{ tier: "Nano", count: 1, budget: 5000 }] }, "u"), /API key: API_KEY in \.env\.local/); // no key -> pointer, not blank
console.log("brief ok");
