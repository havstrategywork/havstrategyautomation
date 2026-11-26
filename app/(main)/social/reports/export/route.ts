import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import { buildReport, parseRange, reportRows, todayIn, toCsv } from "@/lib/buffer";
import { canView } from "@/lib/roles";
import { currentUser } from "@/lib/session";

// CSV of the same report the page shows: ?org=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD&acc=<buffer channel id>&acc=...  (the proxy already requires a login; this checks the role too)
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me || !canView(me.role, "/social/reports")) return new Response("Forbidden", { status: 403 });
  const q = new URL(req.url).searchParams, org = q.get("org") ?? "";
  if (!ObjectId.isValid(org)) return new Response("Unknown organization", { status: 400 });
  const want = new Set(q.getAll("acc")), { orgs } = await db(), o = await orgs.findOne({ _id: new ObjectId(org) });
  if (!o) return new Response("Unknown organization", { status: 400 });
  const chans = (o.buffer ?? []).filter((c) => !want.size || want.has(c.channelId)); // only channels this org has linked, whatever ids the URL carries
  const { range } = parseRange({ from: q.get("from") ?? "", to: q.get("to") ?? "" }, todayIn());

  const rows = (await Promise.all(chans.map(async (c) => reportRows(c.name, await buildReport(c, range))))).flat();
  const name = `buffer-report-${o.name.replace(/[^\w-]+/g, "-").toLowerCase()}-${range.from}-to-${range.to}.csv`;
  return new Response("﻿" + toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
