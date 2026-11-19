import { unauthorized } from "@/lib/auth";
import { autoCreateBatches, sendAllGuidelines } from "@/lib/deals";
import { notify } from "@/lib/notify";

// The hourly "guidelines" run: push agreed deals into clients' own sheets (only where a sheetUrl is already saved), then email the approved
// creators. A client with no sheetUrl just waits for the manual "Create sheet" button on Campaigns. The client's answers still only get in by
// a human uploading the returned sheet there, not from here.
// Safe to call as often as you like: a creator is batched/emailed once, ever. No Instagram involved, so it ignores the pause switch and the run lock on purpose.
export async function POST(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const batches = await autoCreateBatches();
  const send = await sendAllGuidelines();
  const errors = [...batches.flatMap((b) => ("error" in b ? [b.error] : [])), ...send.flatMap((s) => ("error" in s ? [s.error] : []))];
  if (errors.length) await notify("Guidelines run needs attention", errors.join(", ").slice(0, 500));
  return Response.json({ batches, send });
}
