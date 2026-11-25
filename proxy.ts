import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, sessionFor } from "@/lib/session";

// Every dashboard page (and its server actions) needs a valid DB-backed session. /api/* is for the workers and has its own Bearer key
// (the Access Hub's /api/access/* routes check the same session themselves, or a token for the public client onboarding pages).
const PUBLIC = new Set(["/login", "/login/submit"]);
// Client-facing Access Hub pages: clients authorise from a link we send them, with no login. Everything else under /access needs the session.
const PUBLIC_PREFIXES = ["/access/onboard", "/access/onboard-error", "/access/privacy", "/access/terms", "/access/security", "/access/contact", "/access/data-deletion"];
const isPublic = (p: string) => PUBLIC.has(p) || PUBLIC_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));
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
  if (isPublic(p)) return NextResponse.next();
  return ok ? NextResponse.next() : go(req, "/login");
}

export const config = { matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"] };
