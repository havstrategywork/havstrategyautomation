import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import { connectedAccounts, exchangeCode, MetaError, readState, subscribeAccount } from "@/lib/meta";
import { seal } from "@/lib/secrets";
import { baseUrl } from "@/lib/session";

// Meta sends the client back here with ?code=&state=. It sits under /api so the login-session proxy does not apply: the dashboard cookie is SameSite=Strict
// and would not come back from facebook.com anyway. Trust comes from the signed, expiring state that must match the nonce cookie set when the admin started.
// The reply is a tiny page that navigates onward itself, so the next request counts as same-site and carries the session cookie again.
export async function GET(req: Request) {
  const base = baseUrl(req), q = new URL(req.url).searchParams;
  const done = (msg: string, status = 200) => {
    const to = `${base}/social/orgs?m=${encodeURIComponent(msg)}`.replace(/[<>"&]/g, (c) => `&#${c.charCodeAt(0)};`); // the host comes from request headers: keep it inert in HTML
    const res = new NextResponse(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${to}"><title>Instagram</title><p>${status === 200 ? "Done." : "Could not connect."} <a href="${to}">Continue</a></p>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    res.cookies.delete({ name: "hav_oauth", path: "/api/meta" });
    return res;
  };
  const nonce = req.headers.get("cookie")?.match(/(?:^|; )hav_oauth=([^;]+)/)?.[1];
  const st = readState(q.get("state") ?? "", nonce);
  if (!st || !ObjectId.isValid(st.org)) return done("The connection link expired or is invalid. Start again from the organization.", 400);
  if (q.get("error") || !q.get("code")) return done("The Instagram connection was cancelled.", 400);

  const { orgs, botConnections } = await db(), org = await orgs.findOne({ _id: new ObjectId(st.org) });
  if (!org) return done("That organization no longer exists.", 400);
  try {
    const token = await exchangeCode(q.get("code")!), { businessId, accounts } = await connectedAccounts(token);
    if (!accounts.length) return done("Meta shared no Instagram account. Choose at least one account in the login window.", 400);
    const unsubscribed: string[] = [];
    for (const a of accounts) {
      let subscribed = true;
      try { await subscribeAccount(a.id, token); } catch { subscribed = false; unsubscribed.push(a.username ?? a.id); }
      await botConnections.updateOne({ igId: a.id }, { $set: { orgId: org._id!, username: a.username, token: seal(token), businessId, connectedAt: new Date(), subscribed }, $unset: { lastError: "" } }, { upsert: true });
    }
    return done(`${org.name}: connected ${accounts.map((a) => `@${a.username ?? a.id}`).join(", ")}.${unsubscribed.length ? ` Webhook subscription failed for ${unsubscribed.join(", ")}: subscribe it in the Meta app dashboard.` : ""}`);
  } catch (e) {
    return done(e instanceof MetaError ? e.message : "Could not finish the connection.", 400);
  }
}
