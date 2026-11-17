import assert from "node:assert";
import { tierOf } from "./fields.ts";
import { exportCsv, num, parseCsv, parseDate } from "./csv.ts";

assert.deepEqual([5000, 10000, 99999, 100000, 500000, 1e6].map(tierOf), ["Nano", "Micro", "Micro", "Mid-tier", "Macro", "Mega"]);
assert.equal(num("12.5k"), 12500);
assert.equal(num("1,200"), 1200);
assert.equal(num("1.2M"), 1.2e6);
assert.equal(num("6.5%"), 6.5);
assert.equal(num("abc"), undefined);
assert.equal(parseDate("03/04/2025")?.toISOString().slice(0, 10), "2025-04-03"); // day first
assert.equal(parseDate("nope"), undefined);

// export -> import round trip, with commas, quotes and newlines in a cell
const csv = exportCsv(
  [{ igHandle: "a", name: 'Ann "A", Jr', followers: 45000, notes: "line1\nline2", niches: ["fitness"], collab: { count: 1, rating: 4, notes: "" }, status: "Replied", suggestedVia: ["c1"], quotedRate: "1.5k INR", dmSentAt: new Date("2025-01-02") }],
  () => "FitFuel",
);
const [p] = parseCsv(csv);
assert.equal(p.payload.name, 'Ann "A", Jr');
assert.equal(p.payload.notes, "line1\nline2");
assert.equal(p.payload.followers, 45000);
assert.equal(p.payload.status, "Replied");
assert.deepEqual(p.suggestedNames, ["FitFuel"]);
assert.equal(p.payload.quotedRate, "1.5k INR");
assert.equal((p.payload.dmSentAt as Date).toISOString().slice(0, 10), "2025-01-02");
assert.equal(parseCsv("Instagram Handle,Status\nx,bogus")[0].warnings.length, 1);
console.log("csv ok");
