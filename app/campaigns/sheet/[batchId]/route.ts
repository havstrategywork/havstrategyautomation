import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { exportXlsx } from "@/lib/sheet";

// NOT under /api/: the proxy's login matcher covers every other path, so this is dashboard-only automatically.
export async function GET(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  if (!(await currentUser())) return new Response("sign in first", { status: 401 });
  const { batchId } = await params;
  if (!ObjectId.isValid(batchId)) return new Response("bad id", { status: 400 });
  const b = await (await db()).dealBatches.findOne({ _id: new ObjectId(batchId) });
  if (!b) return new Response("not found", { status: 404 });
  const buf = await exportXlsx(b.sheetId);
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${(b.tab || "sheet").replace(/[^\w .-]/g, "_")}.xlsx"`,
    },
  });
}
