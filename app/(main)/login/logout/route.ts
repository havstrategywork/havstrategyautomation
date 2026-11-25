import { NextResponse } from "next/server";
import { baseUrl, COOKIE, endSession, sameOrigin } from "@/lib/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("Forbidden", { status: 403 });
  await endSession(req.headers.get("cookie")?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1]); // the session is deleted server-side, not just the cookie
  const res = NextResponse.redirect(`${baseUrl(req)}/login`, 303);
  res.cookies.delete(COOKIE);
  return res;
}
