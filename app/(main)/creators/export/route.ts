import { db } from "@/lib/db";
import { exportCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

// UI download (the pages are open, so this is too; the /api routes are the ones behind the key).
export async function GET() {
  const { creators, clients } = await db();
  const names = new Map((await clients.find().toArray()).map((c) => [String(c._id), c.name]));
  const body = exportCsv(await creators.find().sort({ createdAt: 1 }).toArray(), (id) => names.get(String(id)) ?? String(id));
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="creators-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
