import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import { buildReport, parseRange, reportRows, toCsv, todayIn } from "@/lib/igreport";
import { canView } from "@/lib/roles";
import { unseal } from "@/lib/secrets";
import { currentUser } from "@/lib/session";

// CSV of the same report the page shows: ?org=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD&acc=<account id>&acc=...  (the proxy already requires a login; this checks the role too)
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me || !canView(me.role, "/social/reports")) return new Response("Forbidden", { status: 403 });
  const q = new URL(req.url).searchParams, org = q.get("org") ?? "";
  if (!ObjectId.isValid(org)) return new Response("Unknown organization", { status: 400 });
  const { orgs, socialAccounts } = await db(), o = await orgs.findOne({ _id: new ObjectId(org) });
  if (!o?.metricool) return new Response("This organization has no Metricool login", { status: 400 });
  const want = q.getAll("acc").filter((x) => ObjectId.isValid(x)).map((x) => new ObjectId(x));
  const accounts = await socialAccounts.find({ orgId: o._id!, ...(want.length && { _id: { $in: want } }) }).sort({ igHandle: 1 }).toArray();
  const { range } = parseRange({ from: q.get("from") ?? "", to: q.get("to") ?? "" }, todayIn());
  let creds;
  try { creds = { userId: o.metricool.userId, token: unseal(o.metricool.token) }; } catch { return new Response("The saved Metricool token can no longer be read", { status: 400 }); }

  const rows = (await Promise.all(accounts.map(async (a) => reportRows(a.igHandle, await buildReport(creds, a.blogId, range))))).flat();
  const name = `instagram-report-${o.name.replace(/[^\w-]+/g, "-").toLowerCase()}-${range.from}-to-${range.to}.csv`;
  return new Response("﻿" + toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
