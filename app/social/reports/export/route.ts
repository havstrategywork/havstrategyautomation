import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import { demoReport } from "@/lib/igdemo";
import { buildReport, parseRange, reportRows, todayIn, toCsv } from "@/lib/igreport";
import { canView } from "@/lib/roles";
import { unseal } from "@/lib/secrets";
import { currentUser } from "@/lib/session";

// CSV of the same report the page shows: ?org=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD&acc=<connection id>&acc=...  (the proxy already requires a login; this checks the role too)
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me || !canView(me.role, "/social/reports")) return new Response("Forbidden", { status: 403 });
  const q = new URL(req.url).searchParams, org = q.get("org") ?? "";
  if (!ObjectId.isValid(org)) return new Response("Unknown organization", { status: 400 });
  const want = q.getAll("acc").filter((x) => ObjectId.isValid(x)).map((x) => new ObjectId(x));
  const { botConnections, orgs } = await db(), o = await orgs.findOne({ _id: new ObjectId(org) });
  if (!o) return new Response("Unknown organization", { status: 400 });
  const conns = await botConnections.find({ orgId: o._id!, ...(want.length && { _id: { $in: want } }) }).sort({ username: 1 }).toArray();
  const { range } = parseRange({ from: q.get("from") ?? "", to: q.get("to") ?? "" }, todayIn());

  const rows = (await Promise.all(conns.map(async (c) => {
    if (c.test) return reportRows(`${c.username ?? c.igId} (DEMO DATA)`, demoReport(range, c.igId));
    let token: string;
    try { token = unseal(c.token); } catch { return [[c.username ?? c.igId, "error", "", "", "The saved Meta token can no longer be read: reconnect this account", ""] as (string | number)[]]; }
    return reportRows(c.username ?? c.igId, await buildReport(token, c.igId, range));
  }))).flat();
  const name = `instagram-report-${o.name.replace(/[^\w-]+/g, "-").toLowerCase()}-${range.from}-to-${range.to}.csv`;
  return new Response("﻿" + toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
