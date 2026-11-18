import { unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";

// body: { runId, ok, note? }. Releases the lock and records the heartbeat shown on the dashboard.
export async function POST(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const b = await req.json().catch(() => ({}));
  const { control, runs } = await db();
  const st = await control.findOne({ _id: "state" });
  if (!st?.run || st.run.id !== b.runId) return Response.json({ error: "no matching active run" }, { status: 404 });
  await runs.insertOne({ kind: st.run.kind, startedAt: st.run.startedAt, endedAt: new Date(), ok: b.ok !== false, ...(b.note && { note: String(b.note).slice(0, 500) }) });
  await control.updateOne({ _id: "state" }, {
    $unset: { run: "" },
    $set: { lastRun: { kind: st.run.kind, startedAt: st.run.startedAt, endedAt: new Date(), ok: b.ok !== false, ...(b.note && { note: String(b.note).slice(0, 500) }) } },
  });
  if (b.ok === false) await notify(`Run failed: ${st.run.kind}`, String(b.note ?? "").slice(0, 300));
  return Response.json({ ok: true });
}
