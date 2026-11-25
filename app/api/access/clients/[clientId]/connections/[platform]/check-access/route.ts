import { NextResponse } from "next/server";
import { isResponse, withCapability } from "@/lib/access/api/guard";
import { getClientById } from "@/lib/access/db/queries/clients";
import { getConnection, getCredentials, listAssetsForConnection, updateConnectionStatus } from "@/lib/access/db/queries/connections";
import { decryptSecret } from "@/lib/access/crypto/tokens";
import { getAdapter } from "@/lib/access/integrations/registry";
import { reverifyConnectionAssets } from "@/lib/access/integrations/oauth-flow";
import { logAudit } from "@/lib/access/audit";
import type { OAuthAuthorizationStatus, Phase1Platform } from "@/lib/access/types";

export async function POST(_req: Request, { params }: { params: Promise<{ clientId: string; platform: string }> }) {
  const guard = await withCapability("verify_connection");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { clientId, platform } = await params;

  const client = await getClientById(db, ctx.organizationId, clientId);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const connection = await getConnection(db, clientId, platform);
  if (!connection) return NextResponse.json({ error: "Connection not found." }, { status: 404 });

  const creds = await getCredentials(db, connection.id);
  if (!creds?.encryptedAccessToken) {
    return NextResponse.json({ error: "No stored authorization to verify yet." }, { status: 409 });
  }
  const token = decryptSecret(creds.encryptedAccessToken);
  if (!token.ok) return NextResponse.json({ error: token.error }, { status: 500 });

  const adapter = getAdapter(platform as Phase1Platform);
  const health = await adapter.getConnectionHealth({ accessToken: token.value, tokenExpiry: connection.tokenExpiry });
  await updateConnectionStatus(db, connection.id, {
    connectionHealth: health.health,
    tokenValidityStatus: health.tokenValidityStatus,
    oauthAuthorizationStatus: health.tokenValidityStatus === "expired" ? "authorization_expired" : (connection.oauthAuthorizationStatus as OAuthAuthorizationStatus),
  });

  const assets = await listAssetsForConnection(db, connection.id);
  const result = health.tokenValidityStatus === "valid" && assets.length > 0
    ? await reverifyConnectionAssets(db, connection.id, token.value, assets.map((a) => ({ externalAssetId: a.externalAssetId, assetName: a.assetName, assetType: a.assetType, availablePermissions: a.grantedPermissions as string[] })))
    : null;

  await logAudit(db, { organizationId: ctx.organizationId, clientId, actorId: ctx.userId, actorType: "agency_user", action: "connection.checked", platform });

  return NextResponse.json({ ok: true, health, verification: result });
}
