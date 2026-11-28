import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { roleOf } from "./roles";

export const COOKIE = "hav_session";
export const SESSION_MS = 7 * 24 * 3600e3; // hard limit: log in again after 7 days
const IDLE_MS = 24 * 3600e3; // ...or after 24h without a request
const LOCK_AFTER = 10; // wrong passwords before the account locks (5 min, doubling each time, max 1h)
const IP_MAX = 40, IP_WINDOW = 15 * 60e3; // failed logins per IP per 15 min

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const wait = () => new Promise((r) => setTimeout(r, 400 + Math.random() * 400)); // slows guessing
let dummy: Promise<string> | undefined; // hash to check against for unknown usernames, so timing doesn't reveal which exist

/** Valid session for this cookie token, or null. Used by the proxy and by pages. */
export async function sessionFor(token?: string) {
  if (!token || token.length > 100) return null;
  const { sessions, users } = await db();
  const now = Date.now();
  const s = await sessions.findOne({ tokenHash: sha(token), expiresAt: { $gt: new Date(now) }, lastSeen: { $gt: new Date(now - IDLE_MS) } });
  if (!s) return null;
  if (now - +s.lastSeen > 60e3) await sessions.updateOne({ _id: s._id }, { $set: { lastSeen: new Date(now) } });
  const u = await users.findOne({ _id: s.userId });
  return u ? { id: u._id!, username: u.username, email: u.email ?? null, role: roleOf(u.role) } : null; // role is read fresh each request, so a change applies at once
}

// cache(): within one page render the layout and the page share a single lookup. Nothing is kept between requests; the proxy, route handlers
// and server actions look the session up afresh, so a logout or a role change still applies at once.
export const currentUser = cache(async () => sessionFor((await cookies()).get(COOKIE)?.value));

export async function endSession(token?: string) {
  if (token) await (await db()).sessions.deleteOne({ tokenHash: sha(token) });
}

/** Checks the password, applies lockouts, and on success returns a fresh session token (only its hash is stored). */
export async function login(username: string, password: string, ip: string, ua = ""): Promise<{ token: string } | { error: "bad" | "locked" }> {
  const { users, sessions, loginAttempts } = await db();
  const now = new Date();
  const tries = await loginAttempts.findOne({ _id: ip, resetAt: { $gt: now } });
  if (tries && tries.n >= IP_MAX) return { error: "locked" };

  const u = await users.findOne(username.includes("@") ? { $or: [{ username }, { email: username }] } : { username }); // sign in with the username or the email
  if (u?.lockedUntil && u.lockedUntil > now) return { error: "locked" };
  const ok = await verifyPassword(password, u?.passwordHash ?? (await (dummy ??= hashPassword("not-a-real-password"))));

  if (!u || !ok) {
    await loginAttempts.updateOne({ _id: ip }, { $inc: { n: 1 }, $setOnInsert: { resetAt: new Date(Date.now() + IP_WINDOW) } }, { upsert: true });
    if (u) {
      const fails = (u.fails ?? 0) + 1;
      const lock = fails >= LOCK_AFTER ? { lockedUntil: new Date(Date.now() + Math.min(5 * 60e3 * 2 ** (u.lockCount ?? 0), 3600e3)), fails: 0, lockCount: (u.lockCount ?? 0) + 1 } : { fails };
      await users.updateOne({ _id: u._id }, { $set: lock });
    }
    await wait();
    return { error: "bad" };
  }

  await users.updateOne({ _id: u._id }, { $set: { fails: 0, lockCount: 0 }, $unset: { lockedUntil: "" } });
  await loginAttempts.deleteOne({ _id: ip });
  const token = randomBytes(32).toString("base64url");
  await sessions.insertOne({ tokenHash: sha(token), userId: u._id!, createdAt: now, lastSeen: now, expiresAt: new Date(Date.now() + SESSION_MS), ip, ua: ua.slice(0, 200) });
  return { token };
}

// Request helpers for the login/logout route handlers (they sit behind ngrok, so honour the forwarded headers).
// ponytail: x-forwarded-for is client-supplied if someone hits the app directly; the per-account lockout is the real brake.
export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
export const baseUrl = (req: Request) => `${req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}`;
/** CSRF guard for the form posts. Browsers set Sec-Fetch-Site themselves (a page can't forge it); older clients fall back to the Origin header. */
export function sameOrigin(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const o = req.headers.get("origin");
  try { return !!o && new URL(o).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host")); } catch { return false; }
}
