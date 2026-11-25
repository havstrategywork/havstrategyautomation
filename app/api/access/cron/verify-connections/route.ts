import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/access/api/cron-guard";
import { getDb } from "@/lib/access/db";
import { runVerificationSweep } from "@/lib/access/integrations/verification-sweep";

export async function POST(req: Request) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const dbResult = await getDb();
  if (!dbResult.ok) return NextResponse.json({ error: dbResult.error }, { status: 503 });

  const result = await runVerificationSweep(dbResult.db);
  return NextResponse.json({ ok: true, ...result });
}
