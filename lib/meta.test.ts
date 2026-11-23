import assert from "node:assert";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { connectedAccounts, exchangeCode, loginUrl, missingEnv, readState, sendMessage, signState, subscribeAccount, validSignature, MetaError } from "./meta.ts";

process.env.SECRETS_KEY = "meta-test-key-123";
// ---- OAuth state: signed, expiring, bound to the browser's cookie nonce ----
const { state, nonce } = signState("org123");
assert.deepEqual(readState(state, nonce), { org: "org123" });
assert.equal(readState(state, "other-nonce"), null); // another browser
assert.equal(readState(state, undefined), null);
assert.equal(readState(state.slice(0, -2) + "xx", nonce), null); // tampered signature
const [b] = state.split("."), forged = Buffer.from(JSON.stringify({ org: "evil", nonce, exp: Date.now() + 1e6 })).toString("base64url");
assert.equal(readState(`${forged}.${state.split(".")[1]}`, nonce), null); // payload swapped, old signature
assert.equal(readState(state, nonce, Date.now() + 11 * 60e3), null); // expired
assert.ok(b);

// ---- webhook signature ----
const raw = JSON.stringify({ object: "instagram" }), sig = "sha256=" + createHmac("sha256", "appsecret").update(raw).digest("hex");
assert.ok(validSignature(raw, sig, "appsecret"));
assert.ok(!validSignature(raw + " ", sig, "appsecret")); // body changed
assert.ok(!validSignature(raw, sig, "wrong"));
assert.ok(!validSignature(raw, null, "appsecret"));
assert.ok(!validSignature(raw, "sha256=" + "0".repeat(64), "appsecret"));
assert.ok(!validSignature(raw, sig, "")); // no secret configured: nothing is trusted

// ---- login URL + Graph calls against a local stand-in ----
process.env.META_APP_ID = "111"; process.env.META_CONFIG_ID = "cfg9"; process.env.META_APP_SECRET = "appsecret"; process.env.APP_URL = "https://app.example.com/"; process.env.META_VERIFY_TOKEN = "vt";
assert.deepEqual(missingEnv(), []);
const u = new URL(loginUrl("S1"));
assert.equal(u.host, "www.facebook.com"); assert.equal(u.searchParams.get("config_id"), "cfg9"); assert.equal(u.searchParams.get("redirect_uri"), "https://app.example.com/api/meta/callback"); assert.equal(u.searchParams.get("state"), "S1");

const calls: string[] = [];
const srv = createServer((req, res) => {
  let body = ""; req.on("data", (d) => (body += d)); req.on("end", () => {
    const url = new URL(req.url!, "http://x"); calls.push(`${req.method} ${url.pathname} auth=${req.headers.authorization ?? "-"} ${body}`);
    const j = (o: unknown, code = 200) => res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(o));
    if (url.pathname.endsWith("/oauth/access_token")) return url.searchParams.get("code") === "good" ? j({ access_token: "TOKEN1" }) : j({ error: { message: "bad code" } }, 400);
    if (req.headers.authorization !== "Bearer TOKEN1") return j({ error: { message: "bad token" } }, 401);
    if (url.pathname.endsWith("/me")) return j({ client_business_id: "B1" });
    if (url.pathname.endsWith("/me/assigned_instagram_accounts")) return j({ data: [{ id: "17841", username: "acme" }, { username: "no-id" }] });
    return j({ recipient_id: "1", message_id: "m" });
  });
});
await new Promise<void>((r) => srv.listen(0, r));
process.env.META_GRAPH_BASE = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
assert.equal(await exchangeCode("good"), "TOKEN1");
await assert.rejects(() => exchangeCode("nope"), (e: Error) => e instanceof MetaError && /bad code/.test(e.message));
assert.deepEqual(await connectedAccounts("TOKEN1"), { businessId: "B1", accounts: [{ id: "17841", username: "acme" }] });
await subscribeAccount("17841", "TOKEN1");
await sendMessage("17841", "TOKEN1", "999", { text: "hi" });
await assert.rejects(() => sendMessage("17841", "WRONG", "999", { text: "hi" }), /bad token/);
assert.ok(calls.some((c) => c.startsWith("POST /v27.0/17841/messages auth=Bearer TOKEN1") && c.includes('"recipient":{"id":"999"}') && c.includes('"message":{"text":"hi"}')));
assert.ok(calls.some((c) => c.includes("/17841/subscribed_apps")));
assert.ok(!calls.some((c) => c.includes("access_token=TOKEN1"))); // the token goes in a header, never in a URL that could be logged
srv.close();
console.log("meta ok");
