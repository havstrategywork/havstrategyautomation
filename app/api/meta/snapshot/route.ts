import { unauthorized } from "@/lib/auth";
import { snapshotAll } from "@/lib/igstore";

// The daily history job (Vercel Cron, see vercel.json). Needs the same Bearer key as the other workers: on Vercel set CRON_SECRET to the API_KEY value,
// because Vercel sends "Authorization: Bearer <CRON_SECRET>". ?days=N (1-31) re-saves the last N finished days; the default of 3 is the daily run.
async function run(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const days = Math.min(31, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 3));
  return Response.json({ days, accounts: await snapshotAll(days) });
}
export const GET = run, POST = run;
