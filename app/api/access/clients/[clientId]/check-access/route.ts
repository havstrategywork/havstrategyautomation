import { NextResponse } from "next/server";
import { isResponse, withCapability } from "@/lib/access/api/guard";
import { getClientById } from "@/lib/access/db/queries/clients";
import { listAssetsForConnection, listConnectionsForClient, updateConnectionStatus } from "@/lib/access/db/queries/connections";
import { getFreshAccessToken } from "@/lib/access/integrations/fresh-token";
import { getAdapter } from "@/lib/access/integrations/registry";
import { reverifyConnectionAssets } from "@/lib/access/integrations/oauth-flow";
import { logAudit } from "@/lib/access/audit";
import type { Platform } from "@/lib/access/types";

/** Client-level "Check access" (section 8 table row action) - re-verifies every one of this client's active connections in one call. */
export async function POST(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const guard = await withCapability("verify_connection");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { clientId } = await params;

  const client = await getClientById(db, ctx.organizationId, clientId);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const connections = await listConnectionsForClient(db, clientId);
  const results: Record<string, string> = {};

  for (const connection of connections) {
    if (connection.oauthAuthorizationStatus !== "application_authorized") {
      results[connection.platform] = "skipped";
      continue;
    }
    const token = await getFreshAccessToken(db, connection);
    if (!token.ok) {
      results[connection.platform] = token.reason;
      continue;
    }

    const adapter = getAdapter(connection.platform as Platform);
    const health = await adapter.getConnectionHealth({ accessToken: token.accessToken, tokenExpiry: token.expiresAt, account: connection.providerUserId });
    await updateConnectionStatus(db, connection.id, {
      connectionHealth: health.health,
      tokenValidityStatus: health.tokenValidityStatus,
      oauthAuthorizationStatus: health.tokenValidityStatus === "expired" ? "authorization_expired" : "application_authorized",
    });

    if (health.tokenValidityStatus === "valid") {
      const assets = await listAssetsForConnection(db, connection.id);
      if (assets.length > 0) {
        await reverifyConnectionAssets(db, connection.id, token.accessToken, assets.map((a) => ({ externalAssetId: a.externalAssetId, assetName: a.assetName, assetType: a.assetType, availablePermissions: a.grantedPermissions as string[] })));
      }
    }
    results[connection.platform] = health.tokenValidityStatus;
  }

  await logAudit(db, { organizationId: ctx.organizationId, clientId, actorId: ctx.userId, actorType: "agency_user", action: "connection.checked", metadata: results });

  return NextResponse.json({ ok: true, results });
}
