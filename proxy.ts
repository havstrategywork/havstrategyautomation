import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, sessionFor } from "@/lib/session";

// Every dashboard page (and its server actions) needs a valid DB-backed session. /api/* is for the workers and has its own Bearer key.
const PUBLIC = new Set(["/login", "/login/submit"]);
// Absolute URL built from the forwarded headers, so redirects stay on the ngrok address instead of jumping to localhost.
const go = (req: NextRequest, path: string) => {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const res = NextResponse.redirect(new URL(path, `${proto}://${host}`), 307);
  res.headers.set("Cache-Control", "no-store");
  return res;
};

export async function proxy(req: NextRequest) {
  const ok = !!(await sessionFor(req.cookies.get(COOKIE)?.value));
  const p = req.nextUrl.pathname;
  if (PUBLIC.has(p)) return ok && p === "/login" ? go(req, "/") : NextResponse.next();
  return ok ? NextResponse.next() : go(req, "/login");
}

export const config = { matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"] };
