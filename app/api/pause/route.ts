import { unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";

// Kill switch. Claude calls this on any Instagram challenge, action block, "try again later", login wall or odd behaviour.
// There is deliberately NO API to resume: only the dashboard button (a human) can.
export async function POST(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const { reason } = await req.json().catch(() => ({ reason: "" }));
  await (await db()).control.updateOne({ _id: "state" }, { $set: { paused: { reason: String(reason || "unspecified").slice(0, 500), at: new Date() } } }, { upsert: true });
  await notify("Automation PAUSED", `${String(reason || "unspecified").slice(0, 300)}
Check the Instagram account, then press Resume on the dashboard.`);
  return Response.json({ ok: true, paused: true });
}
