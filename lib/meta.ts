// Meta (Instagram) side of the chat bots: "Instagram API with Unified Login" (Facebook Login for Business), messages through graph.facebook.com/<IG_ID>/messages.
// Env: META_APP_ID, META_APP_SECRET, META_CONFIG_ID (the login configuration), META_VERIFY_TOKEN (any string; the same one goes in the app's webhook settings),
// APP_URL (the public https address: it is the OAuth redirect host), optional META_API_VERSION and META_GRAPH_BASE (tests point it at a local stub).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const cfg = () => ({
  appId: process.env.META_APP_ID ?? "", appSecret: process.env.META_APP_SECRET ?? "", configId: process.env.META_CONFIG_ID ?? "", verifyToken: process.env.META_VERIFY_TOKEN ?? "",
  version: process.env.META_API_VERSION ?? "v27.0", graph: process.env.META_GRAPH_BASE ?? "https://graph.facebook.com", app: (process.env.APP_URL ?? "").replace(/\/+$/, ""),
});
export const missingEnv = () => { const c = cfg(); return ([["META_APP_ID", c.appId], ["META_APP_SECRET", c.appSecret], ["META_CONFIG_ID", c.configId], ["META_VERIFY_TOKEN", c.verifyToken], ["APP_URL", c.app]] as const).filter(([, v]) => !v).map(([k]) => k); };
export const redirectUri = () => `${cfg().app}/api/meta/callback`;
export class MetaError extends Error {}

// ---- OAuth state: signed + expiring, and tied to a cookie nonce, so a callback can't be forged or replayed from another browser ----
const key = () => { const k = process.env.SECRETS_KEY || process.env.API_KEY || ""; if (k.length < 8) throw new Error("SECRETS_KEY or API_KEY must be set"); return k; };
const mac = (s: string) => createHmac("sha256", key()).update(s).digest("base64url");
export function signState(org: string, now = Date.now()) {
  const nonce = randomBytes(16).toString("base64url"), body = Buffer.from(JSON.stringify({ org, nonce, exp: now + 10 * 60e3 })).toString("base64url");
  return { state: `${body}.${mac(body)}`, nonce };
}
export function readState(state: string, nonce: string | undefined, now = Date.now()): { org: string } | null {
  const [body, sig] = state.split("."), want = body ? Buffer.from(mac(body)) : Buffer.alloc(0), got = Buffer.from(sig ?? "");
  if (!body || got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try { const s = JSON.parse(Buffer.from(body, "base64url").toString()) as { org: string; nonce: string; exp: number }; return s.exp > now && nonce && s.nonce === nonce ? { org: s.org } : null; } catch { return null; }
}
export const loginUrl = (state: string) => { const c = cfg(); return `https://www.facebook.com/dialog/oauth?${new URLSearchParams({ client_id: c.appId, config_id: c.configId, redirect_uri: redirectUri(), response_type: "code", display: "popup", prompt: "login", state })}`; };

// ---- webhook signature: HMAC-SHA256 of the raw body with the app secret, header "sha256=<hex>" ----
export function validSignature(raw: string, header: string | null, secret = cfg().appSecret) {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex")), got = Buffer.from(header.slice(7));
  return got.length === want.length && timingSafeEqual(got, want);
}

// ---- Graph API ----
async function graph<T>(method: "GET" | "POST", path: string, token: string | null, params: Record<string, string> = {}, body?: unknown): Promise<T> {
  const c = cfg(), url = new URL(`${c.graph}/${c.version}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let r: Response;
  try { r = await fetch(url, { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body !== undefined && { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000), cache: "no-store" }); }
  catch { throw new MetaError("Could not reach Meta (timeout or network)."); }
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!r.ok) throw new MetaError(j.error?.message ? `Meta: ${j.error.message}` : `Meta answered ${r.status}.`);
  return j;
}

// Report reads: answers are kept for `ttl` ms and at most 8 calls run at once (one report is ~15 calls per account).
// ponytail: per-process memory (each serverless instance has its own); fine for a small team, move to Mongo/Redis if it ever matters.
const cache = new Map<string, { at: number; data: unknown }>();
let active = 0; const waiting: (() => void)[] = [];
const acquire = async () => { if (active < 8) { active++; return; } await new Promise<void>((r) => waiting.push(r)); }; // a freed slot is handed straight to the next waiter
const release = () => { const next = waiting.shift(); if (next) next(); else active--; };
export async function graphGet<T>(path: string, token: string, params: Record<string, string> = {}, ttl = 0): Promise<T> {
  const key = `${token}|${path}|${JSON.stringify(Object.entries(params).sort())}`; // the token is part of the key: a wrong token must never see another login's cached answer
  const hit = ttl ? cache.get(key) : undefined;
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  await acquire();
  try {
    const data = await graph<T>("GET", path, token, params);
    if (ttl) { if (cache.size > 500) cache.clear(); cache.set(key, { at: Date.now(), data }); }
    return data;
  } finally { release(); }
}

export const exchangeCode = async (code: string) => { const c = cfg(); return (await graph<{ access_token: string }>("GET", "/oauth/access_token", null, { client_id: c.appId, client_secret: c.appSecret, code, redirect_uri: redirectUri() })).access_token; };
export async function connectedAccounts(token: string) {
  const [me, acc] = await Promise.all([
    graph<{ client_business_id?: string }>("GET", "/me", token, { fields: "client_business_id" }).catch(() => ({} as { client_business_id?: string })),
    graph<{ data?: { id: string; username?: string }[] }>("GET", "/me/assigned_instagram_accounts", token, { fields: "id,username" }),
  ]);
  return { businessId: me.client_business_id, accounts: (acc.data ?? []).filter((a) => a.id) };
}
/** Subscribes one Instagram account to this app's webhook fields. */
export const subscribeAccount = (igId: string, token: string) => graph("POST", `/${igId}/subscribed_apps`, token, { subscribed_fields: "messages,messaging_postbacks" });
export const sendMessage = (igId: string, token: string, igsid: string, message: Record<string, unknown>) => graph("POST", `/${igId}/messages`, token, {}, { recipient: { id: igsid }, message });
