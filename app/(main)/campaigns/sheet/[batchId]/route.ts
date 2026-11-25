import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { exportXlsx } from "@/lib/sheet";
import { reviewRows } from "@/lib/deals";
import { creatorsXlsx } from "@/lib/xlsx";

// NOT under /api/: the proxy's login matcher covers every other path, so this is dashboard-only automatically.
export async function GET(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  if (!(await currentUser())) return new Response("sign in first", { status: 401 });
  const { batchId } = await params;
  if (!ObjectId.isValid(batchId)) return new Response("bad id", { status: 400 });
  const { dealBatches, creators } = await db();
  const b = await dealBatches.findOne({ _id: new ObjectId(batchId) });
  if (!b) return new Response("not found", { status: 404 });
  // A Google-backed batch exports the live sheet; a no-sheetUrl client's batch has no sheetId, so it's rebuilt from the creators each time (they can change between downloads).
  const buf = b.sheetId ? await exportXlsx(b.sheetId) : await creatorsXlsx(reviewRows(await creators.find({ _id: { $in: b.creatorIds } }).toArray()));
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${(b.tab || "sheet").replace(/[^\w .-]/g, "_")}.xlsx"`,
    },
  });
}
