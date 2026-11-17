import assert from "node:assert";
import { capFor, cleanMoney, overCeiling, parseMoney } from "./money.ts";

assert.deepEqual(parseMoney("10k inr"), { amt: 10000, cur: "INR" });
assert.deepEqual(parseMoney("₹20,000"), { amt: 20000, cur: "INR" });
assert.deepEqual(parseMoney("Rs 1.5 lakh"), { amt: 150000, cur: "INR" });
assert.deepEqual(parseMoney("800 USD"), { amt: 800, cur: "USD" });
assert.equal(parseMoney("10000"), null); // no currency
assert.equal(parseMoney("ten k inr"), null);
assert.equal(cleanMoney("10K inr"), "10k INR");
assert.equal(cleanMoney("10500 inr"), "10,500 INR");
assert.throws(() => cleanMoney("lots", "offer"), /offer/);
const cap = parseMoney("20k INR")!;
assert.equal(overCeiling(parseMoney("15k INR")!, cap), null);
assert.equal(overCeiling(parseMoney("20k INR")!, cap), null); // equal is allowed
assert.match(overCeiling(parseMoney("20,001 INR")!, cap)!, /above/);
assert.match(overCeiling(parseMoney("400 AED")!, cap)!, /INR/); // wrong currency refused
const cl = { maxRate: "20k INR", tierRates: { Nano: "10k INR" } };
assert.deepEqual(capFor(cl, 5000), { amt: 10000, cur: "INR" }); // nano: its own cap
assert.deepEqual(capFor(cl, 50000), { amt: 20000, cur: "INR" }); // no micro rate: falls back to maxRate
assert.equal(capFor({}, 5000), null);
console.log("money ok");
