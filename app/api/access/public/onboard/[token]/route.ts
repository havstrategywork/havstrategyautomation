import { NextResponse } from "next/server";
import { withDb, isResponse } from "@/lib/access/api/guard";
import { resolveInvitation } from "@/lib/access/public-onboarding";
import { markInvitationViewed } from "@/lib/access/db/queries/invitations";
import { listAssetsForConnection, listConnectionsForClient, toDisplayStatus } from "@/lib/access/db/queries/connections";
import { trackEvent, logAudit } from "@/lib/access/audit";
import { rateLimit, clientIpFromHeaders } from "@/lib/access/rate-limit";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit(`onboard:view:${ip}`, 60, 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const dbGuard = await withDb();
  if (isResponse(dbGuard)) return dbGuard;
  const { db } = dbGuard;
  const { token } = await params;

  const resolved = await resolveInvitation(db, token);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { invitation, client, organization } = resolved.value;

  if (!invitation.viewedAt) {
    await markInvitationViewed(db, invitation.id);
    await logAudit(db, { organizationId: organization.id, clientId: client.id, actorType: "client", action: "invitation.viewed" });
    await trackEvent(db, { organizationId: organization.id, clientId: client.id, eventType: "onboarding_link_opened" });
  }

  const connections = await listConnectionsForClient(db, client.id);
  const withAssets = await Promise.all(
    connections.map(async (c) => ({
      platform: c.platform,
      displayStatus: toDisplayStatus(c),
      errorMessage: c.errorMessage,
      assets: (await listAssetsForConnection(db, c.id)).map((a) => ({
        externalAssetId: a.externalAssetId,
        assetName: a.assetName,
        assetType: a.assetType,
        verificationStatus: a.verificationStatus,
      })),
    })),
  );

  return NextResponse.json({
    brandName: client.brandName,
    contactName: client.contactName,
    requestedPlatforms: invitation.requestedPlatforms,
    personalizedMessage: invitation.personalizedMessage,
    completedAt: invitation.completedAt,
    organization: { name: organization.organizationName, logoUrl: organization.logoUrl },
    connections: withAssets,
  });
}
