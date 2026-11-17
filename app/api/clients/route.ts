import { unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { upsertClient } from "@/lib/clients";

export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  return Response.json(await (await db()).clients.find().toArray());
}

// Upserts by name (case-insensitive), changing only the fields you send. Safe to call for every new requirement.
// Fields: niches, related, locations, minFollowers, maxFollowers, maxRate, tierRates, notes, offer, dmTemplate, followUpTemplate, weights.
export async function POST(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  try { return Response.json(await upsertClient(await req.json())); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
