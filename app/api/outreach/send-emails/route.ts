import { sendQueuedEmails } from "@/lib/email";
import { unauthorized } from "@/lib/auth";

export async function POST(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  return Response.json(await sendQueuedEmails());
}
