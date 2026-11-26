import { NextResponse } from "next/server";
import { baseUrl, clientIp, COOKIE, login, sameOrigin, SESSION_MS } from "@/lib/session";
import { safeNext } from "@/lib/roles";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("Forbidden", { status: 403 });
  const f = await req.formData();
  const r = await login(String(f.get("username") ?? "").trim().toLowerCase().slice(0, 64), String(f.get("password") ?? "").slice(0, 200), clientIp(req), req.headers.get("user-agent") ?? "");
  const base = baseUrl(req);
  const next = safeNext(f.get("next"));
  if ("error" in r) return NextResponse.redirect(`${base}/login?e=${r.error}${next ? `&next=${next}` : ""}`, 303);
  const res = NextResponse.redirect(`${base}${next ?? "/"}`, 303);
  res.cookies.set(COOKIE, r.token, { httpOnly: true, sameSite: "strict", secure: base.startsWith("https"), path: "/", maxAge: SESSION_MS / 1000 });
  return res;
}
