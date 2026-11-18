import { unauthorized } from "@/lib/auth";
import { sendAllGuidelines } from "@/lib/deals";
import { notify } from "@/lib/notify";

// The hourly "guidelines" run: email the approved creators. The client's answers get in by a human uploading the returned sheet (Campaigns page), not from here.
// Safe to call as often as you like: a creator is emailed once, ever. No Instagram involved, so it ignores the pause switch and the run lock on purpose.
export async function POST(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const send = await sendAllGuidelines();
  const errors = send.flatMap((s) => ("error" in s ? [s.error] : []));
  if (errors.length) await notify("Guidelines run needs attention", errors.join(", ").slice(0, 500));
  return Response.json({ send });
}
