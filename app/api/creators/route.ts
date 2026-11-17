import { unauthorized } from "@/lib/auth";
import { listCreators, upsertCreator } from "@/lib/queries";

export async function GET(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const u = new URL(req.url).searchParams;
  return Response.json(
    await listCreators({
      clientId: u.get("clientId") ?? undefined,
      niche: u.get("niche") ?? undefined,
      q: u.get("q") ?? undefined,
      minScore: Number(u.get("minScore") ?? 0),
      status: u.get("status") ?? undefined,
      tier: u.get("tier") ?? undefined,
      page: u.get("page") ? Number(u.get("page")) : undefined,
      limit: u.get("limit") ? Number(u.get("limit")) : undefined,
    })
  );
}

// body: one creator or an array. Upserts by igHandle/email, so re-pushing is safe.
export async function POST(req: Request) {
  const bad = unauthorized(req); if (bad) return bad;
  const body = await req.json();
  const results = [];
  for (const p of Array.isArray(body) ? body : [body]) {
    try { results.push({ ok: true, creator: await upsertCreator(p) }); }
    catch (e) { results.push({ ok: false, error: (e as Error).message, input: p }); }
  }
  return Response.json(results);
}
