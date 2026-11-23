import assert from "node:assert";
import { createServer } from "node:http";
import { igAccountsFrom, listIgAccounts, MetricoolError } from "./metricool.ts";
import { seal, unseal } from "./secrets.ts";

// secrets: round trip, random IV, tamper and wrong key fail
process.env.SECRETS_KEY = "test-key-12345";
const s = seal("tok_abc123");
assert.equal(unseal(s), "tok_abc123");
assert.notEqual(seal("tok_abc123"), s);
assert.throws(() => unseal(s.slice(0, -2) + "xx"));
process.env.SECRETS_KEY = "another-key-999";
assert.throws(() => unseal(s));

// only brands with an Instagram account become accounts
const got = igAccountsFrom([{ id: 1, label: "Nuume", instagram: "@nuume.in" }, { id: 2, title: "No IG" }, { id: 3, label: "Blank", instagram: "  " }, { id: 4, instagram: "veda", instagramPicture: "p.jpg" }]);
assert.deepEqual(got.map((a) => [a.blogId, a.brand, a.igHandle]), [[1, "Nuume", "nuume.in"], [4, "Brand 4", "veda"]]);

// the client sends token + userId, and turns 401 into a readable error (local stub instead of Metricool)
const srv = createServer((req, res) => {
  const u = new URL(req.url!, "http://x");
  if (req.headers["x-mc-auth"] !== "good" || u.searchParams.get("userId") !== "77") { res.writeHead(401).end(); return; }
  res.setHeader("content-type", "application/json").end(JSON.stringify([{ id: 9, label: "Brand", instagram: "brand_ig" }, { id: 10 }]));
});
await new Promise<void>((r) => srv.listen(0, r));
process.env.METRICOOL_BASE = `http://127.0.0.1:${(srv.address() as { port: number }).port}/api`;
assert.deepEqual((await listIgAccounts({ userId: "77", token: "good" })).map((a) => a.igHandle), ["brand_ig"]);
await assert.rejects(() => listIgAccounts({ userId: "77", token: "bad" }), MetricoolError);
srv.close();
console.log("social ok");
