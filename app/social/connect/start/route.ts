import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import { loginUrl, missingEnv, signState } from "@/lib/meta";
import { baseUrl, currentUser } from "@/lib/session";

// Admin clicks "Connect Instagram" on an organization: send them to Meta's login with a signed state, and remember the nonce in a short-lived cookie.
export async function GET(req: Request) {
  const base = baseUrl(req), back = (m: string) => NextResponse.redirect(`${base}/social/orgs?m=${encodeURIComponent(m)}`, 303);
  if ((await currentUser())?.role !== "admin") return NextResponse.redirect(`${base}/login`, 303);
  const org = new URL(req.url).searchParams.get("org") ?? "";
  if (!ObjectId.isValid(org) || !(await (await db()).orgs.findOne({ _id: new ObjectId(org) }))) return back("No such organization.");
  const missing = missingEnv();
  if (missing.length) return back(`Set ${missing.join(", ")} in the app's environment first (see the Meta setup note on this page).`);
  const { state, nonce } = signState(org), res = NextResponse.redirect(loginUrl(state), 303);
  res.cookies.set("hav_oauth", nonce, { httpOnly: true, sameSite: "lax", secure: base.startsWith("https"), path: "/api/meta", maxAge: 600 }); // Lax: it must come back with Meta's redirect
  return res;
}
