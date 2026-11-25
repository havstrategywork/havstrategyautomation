import { NextResponse } from "next/server";
import { isResponse, withCapability, withSession } from "@/lib/access/api/guard";
import { parseBody, parseQuery } from "@/lib/access/api/validate";
import { createClientSchema, listClientsQuerySchema } from "@/lib/access/validation/client";
import { createClient, listClients } from "@/lib/access/db/queries/clients";
import { logAudit, trackEvent } from "@/lib/access/audit";

export async function GET(req: Request) {
  const guard = await withSession();
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;

  const query = parseQuery(new URL(req.url), listClientsQuerySchema);
  if (!query.ok) return query.response;

  const result = await listClients(db, ctx.organizationId, query.data);
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const guard = await withCapability("create_client");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;

  const parsed = await parseBody(req, createClientSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const clientId = await createClient(db, {
    organizationId: ctx.organizationId,
    brandName: input.brandName,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    website: input.website || null,
    industry: input.industry || null,
    logoUrl: input.logoUrl || null,
    assignedManagerId: input.assignedManagerId || null,
    requiredPlatforms: input.requiredPlatforms,
    permissionPreset: input.permissionPreset,
    customPermissions: input.customPermissions ?? null,
  });

  await logAudit(db, { organizationId: ctx.organizationId, clientId, actorId: ctx.userId, actorType: "agency_user", action: "client.created" });
  await trackEvent(db, { organizationId: ctx.organizationId, clientId, eventType: "client_created" });

  return NextResponse.json({ id: clientId }, { status: 201 });
}
