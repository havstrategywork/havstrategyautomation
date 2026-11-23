import assert from "node:assert";
import { days, TOTALS } from "./igreport.ts";
import { demoReport } from "./igdemo.ts";

const range = { from: "2026-11-01", to: "2026-11-30" };
const a = demoReport(range, "acct"), b = demoReport(range, "acct");
assert.deepEqual(a, b); // the same account + range always shows the same numbers
assert.notDeepEqual(a.totals, demoReport(range, "other").totals); // another account looks different
assert.notDeepEqual(a.totals, demoReport({ from: "2026-11-01", to: "2026-11-07" }, "acct").totals); // and another range too

assert.ok(a.totals.ok && a.account.ok && a.media.ok && a.split.ok);
if (a.totals.ok) {
  for (const m of TOTALS) { assert.ok(a.totals.data.cur[m.key] > 0, m.key); assert.ok(a.totals.data.prev[m.key] > 0, m.key); }
  assert.equal(a.totals.data.windows, 1);
  const changes = TOTALS.map((m) => Math.sign(a.totals.ok ? a.totals.data.cur[m.key] - a.totals.data.prev[m.key] : 0));
  assert.ok(changes.includes(1) && changes.includes(-1), "some metrics up, some down");
}
if (a.media.ok) {
  assert.equal(a.media.data.length, 14);
  assert.ok(a.media.data.some((c) => c.kind === "reel") && a.media.data.some((c) => c.kind === "post"));
  for (const c of a.media.data) { assert.ok(c.at! >= "2026-11-01" && c.at! <= "2026-11-30T23:59", String(c.at)); assert.ok(c.img!.startsWith("data:image/svg+xml"), "thumbnails are inline, no outside requests"); assert.equal(c.url, undefined, "no links to real posts"); assert.ok(c.stats.interactions >= c.stats.likes); }
}
if (a.split.ok) assert.deepEqual(Object.keys(a.split.data).sort(), ["reach", "total_interactions", "views"]);
for (const s of Object.values(a.audience)) assert.ok(s.ok && s.data.length > 2 && s.data[0].value >= s.data[1].value);
// a 90-day range reports 3 windows, like the real thing
const long = demoReport({ from: "2026-08-26", to: "2026-11-23" }, "acct");
assert.equal(days({ from: "2026-08-26", to: "2026-11-23" }), 90);
assert.ok(long.totals.ok && long.totals.data.windows === 3);
console.log("igdemo ok");
