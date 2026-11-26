import { NextResponse } from "next/server";
import { withDb, isResponse } from "@/lib/access/api/guard";
import { parseBody } from "@/lib/access/api/validate";
import { selectAssetsSchema } from "@/lib/access/validation/onboarding";
import { resolveInvitation } from "@/lib/access/public-onboarding";
import { getConnection } from "@/lib/access/db/queries/connections";
import { discoverAssetsForConnection, completeAssetSelection } from "@/lib/access/integrations/oauth-flow";
import { isPlatform } from "@/lib/access/types";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; platform: string }> }) {
  const dbGuard = await withDb();
  if (isResponse(dbGuard)) return dbGuard;
  const { db } = dbGuard;
  const { token, platform } = await params;
  if (!isPlatform(platform)) return NextResponse.json({ error: "Unsupported platform." }, { status: 400 });

  const resolved = await resolveInvitation(db, token);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const connection = await getConnection(db, resolved.value.client.id, platform);
  if (!connection) return NextResponse.json({ error: "Connect this platform first." }, { status: 409 });

  const result = await discoverAssetsForConnection(db, connection.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ assets: result.assets });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string; platform: string }> }) {
  const dbGuard = await withDb();
  if (isResponse(dbGuard)) return dbGuard;
  const { db } = dbGuard;
  const { token, platform } = await params;
  if (!isPlatform(platform)) return NextResponse.json({ error: "Unsupported platform." }, { status: 400 });

  const resolved = await resolveInvitation(db, token);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const connection = await getConnection(db, resolved.value.client.id, platform);
  if (!connection) return NextResponse.json({ error: "Connect this platform first." }, { status: 409 });

  const parsed = await parseBody(req, selectAssetsSchema);
  if (!parsed.ok) return parsed.response;

  // Never trust the browser's claimed `availablePermissions` for what's
  // actually on offer - only which externalAssetIds it picked. The real
  // capability list always comes back from a fresh server-side discovery
  // call, matched by id.
  const discovered = await discoverAssetsForConnection(db, connection.id);
  if (!discovered.ok) return NextResponse.json({ error: discovered.error }, { status: 502 });

  const selectedIds = new Set(parsed.data.selected.map((a) => a.externalAssetId));
  const verifiedSelection = discovered.assets.filter((a) => selectedIds.has(a.externalAssetId));
  if (verifiedSelection.length === 0) {
    return NextResponse.json({ error: "None of the selected accounts matched what's available for this connection." }, { status: 400 });
  }

  const result = await completeAssetSelection(db, connection.id, verifiedSelection);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ ok: true, anyPending: result.anyPending, anyDenied: result.anyDenied });
}
