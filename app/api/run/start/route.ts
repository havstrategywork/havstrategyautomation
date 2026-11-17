import { randomUUID } from "node:crypto";
import { unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { controlState, LONG_RUN_TTL_MS, RUN_TTL_MS } from "@/lib/control";

// Every scheduled run calls this FIRST. 423 = paused (stop, do nothing). 409 = another run is active (stop).
// body: { kind: "replies" | "send" | "briefs" }. One run at a time: they share one Instagram account and one Chrome.
export async function POST(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const { kind = "run" } = await req.json().catch(() => ({}));
  const st = await controlState();
  if (st.paused) return Response.json({ error: "paused", reason: st.paused.reason, at: st.paused.at }, { status: 423 });

  const run = { id: randomUUID(), kind: String(kind), startedAt: new Date() };
  try {
    // Matches only if no run is active (or the active one is stale). Otherwise the upsert collides on _id => 409.
    await (await db()).control.updateOne(
      { _id: "state", $or: [
        { run: { $exists: false } },
        { "run.kind": { $ne: "briefs" }, "run.startedAt": { $lt: new Date(Date.now() - RUN_TTL_MS) } },
        { "run.kind": "briefs", "run.startedAt": { $lt: new Date(Date.now() - LONG_RUN_TTL_MS) } },
      ] },
      { $set: { run } }, { upsert: true },
    );
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return Response.json({ error: "another run is active", run: st.run }, { status: 409 });
    throw e;
  }
  return Response.json({ runId: run.id });
}
