import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, sessionFor } from "@/lib/session";
import { canView, homeFor } from "@/lib/roles";

// Every dashboard page (and its server actions) needs a valid DB-backed session. /api/* is for the workers and has its own Bearer key
// (the Access Hub's /api/access/* routes check the same session themselves, or a token for the public client onboarding pages).
const PUBLIC = new Set(["/login", "/login/submit", "/onboarding"]); // /onboarding is the public client form (its API, /api/onboarding, is outside this matcher)
// Client-facing Access Hub pages: clients authorise from a link we send them, with no login. Everything else under /access needs the session.
const PUBLIC_PREFIXES = ["/access/onboard", "/access/onboard-error", "/access/privacy", "/access/terms", "/access/security", "/access/contact", "/access/data-deletion"];
const isPublic = (p: string) => PUBLIC_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));
// Absolute URL built from the forwarded headers, so redirects stay on the ngrok address instead of jumping to localhost.
const go = (req: NextRequest, path: string) => {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const res = NextResponse.redirect(new URL(path, `${proto}://${host}`), 307);
  res.headers.set("Cache-Control", "no-store");
  return res;
};

export async function proxy(req: NextRequest) {
  const me = await sessionFor(req.cookies.get(COOKIE)?.value);
  const p = req.nextUrl.pathname;
  if (PUBLIC.has(p)) return me && p === "/login" ? go(req, homeFor(me.role)) : NextResponse.next();
  if (isPublic(p)) return NextResponse.next();
  if (!me) return go(req, "/login");
  return canView(me.role, p) ? NextResponse.next() : go(req, homeFor(me.role)); // wrong role: bounce to its own home (server actions post to the page path, so they are covered too)
}

// the logo is public: the login page and the public onboarding form show it to signed-out visitors
export const config = { matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|havstrategy-logo.png).*)"] };
