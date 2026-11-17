import { timingSafeEqual } from "node:crypto";

// API routes are for Claude Code / scripts (Bearer key); the dashboard UI uses the login session instead (see proxy.ts).
// Fails closed: with no API_KEY set, nothing gets in. Constant-time compare, so the key can't be guessed from timing.
export function unauthorized(req: Request) {
  const key = process.env.API_KEY;
  const got = Buffer.from(req.headers.get("authorization") ?? ""), want = Buffer.from(`Bearer ${key}`);
  const ok = !!key && key.length >= 8 && got.length === want.length && timingSafeEqual(got, want);
  return ok ? null : Response.json({ error: "unauthorized" }, { status: 401 });
}
