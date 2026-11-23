import { unauthorized } from "@/lib/auth";
import { snapshotAll } from "@/lib/igstore";

// The daily history job. Call it once a day from any scheduler (e.g. cron-job.org) with the header  Authorization: Bearer <API_KEY>  (same key as the other workers).
// ?days=N (1-31) re-saves the last N finished days; the default of 3 is the daily run. It handles the accounts one after another.
async function run(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const days = Math.min(31, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 3));
  return Response.json({ days, accounts: await snapshotAll(days) });
}
export const GET = run, POST = run;
