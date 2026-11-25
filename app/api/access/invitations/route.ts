import { NextResponse } from "next/server";
import { isResponse, withSession } from "@/lib/access/api/guard";
import { listPendingInvitationsForOrg } from "@/lib/access/db/queries/invitations";

export async function GET() {
  const guard = await withSession();
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;

  const rows = await listPendingInvitationsForOrg(db, ctx.organizationId);
  return NextResponse.json(
    rows.map((r) => ({
      id: r.invitation.id,
      clientId: r.client.id,
      brandName: r.client.brandName,
      contactEmail: r.client.contactEmail,
      requestedPlatforms: r.invitation.requestedPlatforms,
      viewedAt: r.invitation.viewedAt,
      expiresAt: r.invitation.expiresAt,
      createdAt: r.invitation.createdAt,
    })),
  );
}
