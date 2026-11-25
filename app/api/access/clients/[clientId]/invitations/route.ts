import { NextResponse } from "next/server";
import { isResponse, withCapability } from "@/lib/access/api/guard";
import { parseBody } from "@/lib/access/api/validate";
import { createInvitationSchema } from "@/lib/access/validation/client";
import { getClientById } from "@/lib/access/db/queries/clients";
import { listInvitationsForClient } from "@/lib/access/db/queries/invitations";
import { generateInvitation } from "@/lib/access/onboarding";

export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const guard = await withCapability("generate_invitation");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { clientId } = await params;

  const client = await getClientById(db, ctx.organizationId, clientId);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const invitations = await listInvitationsForClient(db, clientId);
  return NextResponse.json(invitations.map((i) => ({ ...i, tokenHash: undefined })));
}

export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const guard = await withCapability("generate_invitation");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { clientId } = await params;

  const client = await getClientById(db, ctx.organizationId, clientId);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const parsed = await parseBody(req, createInvitationSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const result = await generateInvitation(db, {
    organizationId: ctx.organizationId,
    client,
    requestedPlatforms: input.requestedPlatforms,
    personalizedMessage: input.personalizedMessage,
    expiryDays: input.expiryDays,
    createdBy: ctx.userId,
  });

  return NextResponse.json({ id: result.id, url: result.url, expiresInDays: input.expiryDays }, { status: 201 });
}
