import { NextResponse } from "next/server";
import { isResponse, withCapability } from "@/lib/access/api/guard";
import { getClientById } from "@/lib/access/db/queries/clients";
import { getConnection, listAssetsForConnection, updateConnectionStatus } from "@/lib/access/db/queries/connections";
import { getFreshAccessToken } from "@/lib/access/integrations/fresh-token";
import { getAdapter } from "@/lib/access/integrations/registry";
import { reverifyConnectionAssets } from "@/lib/access/integrations/oauth-flow";
import { logAudit } from "@/lib/access/audit";
import type { OAuthAuthorizationStatus, Platform } from "@/lib/access/types";

export async function POST(_req: Request, { params }: { params: Promise<{ clientId: string; platform: string }> }) {
  const guard = await withCapability("verify_connection");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { clientId, platform } = await params;

  const client = await getClientById(db, ctx.organizationId, clientId);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const connection = await getConnection(db, clientId, platform);
  if (!connection) return NextResponse.json({ error: "Connection not found." }, { status: 404 });

  const token = await getFreshAccessToken(db, connection);
  if (!token.ok) {
    return token.reason === "no_credential"
      ? NextResponse.json({ error: "No stored authorization to verify yet." }, { status: 409 })
      : NextResponse.json({ error: token.error }, { status: 500 });
  }

  const adapter = getAdapter(platform as Platform);
  const health = await adapter.getConnectionHealth({ accessToken: token.accessToken, tokenExpiry: token.expiresAt, account: connection.providerUserId });
  await updateConnectionStatus(db, connection.id, {
    connectionHealth: health.health,
    tokenValidityStatus: health.tokenValidityStatus,
    oauthAuthorizationStatus: health.tokenValidityStatus === "expired" ? "authorization_expired" : (connection.oauthAuthorizationStatus as OAuthAuthorizationStatus),
  });

  const assets = await listAssetsForConnection(db, connection.id);
  const result = health.tokenValidityStatus === "valid" && assets.length > 0
    ? await reverifyConnectionAssets(db, connection.id, token.accessToken, assets.map((a) => ({ externalAssetId: a.externalAssetId, assetName: a.assetName, assetType: a.assetType, availablePermissions: a.grantedPermissions as string[] })))
    : null;

  await logAudit(db, { organizationId: ctx.organizationId, clientId, actorId: ctx.userId, actorType: "agency_user", action: "connection.checked", platform });

  return NextResponse.json({ ok: true, health, verification: result });
}
