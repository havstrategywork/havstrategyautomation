import { NextResponse } from "next/server";
import { z } from "zod";
import { isResponse, withCapability, withSession } from "@/lib/access/api/guard";
import { parseBody } from "@/lib/access/api/validate";
import { getOrganizationById, updateOrganizationBranding } from "@/lib/access/db/queries/organizations";
import { logAudit } from "@/lib/access/audit";

const brandingSchema = z.object({
  organizationName: z.string().trim().min(1).max(200).optional(),
  logoUrl: z.string().trim().max(2000).optional().nullable(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  const guard = await withSession();
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;

  const org = await getOrganizationById(db, ctx.organizationId);
  return NextResponse.json(org);
}

export async function PATCH(req: Request) {
  const guard = await withCapability("manage_org_settings");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;

  const parsed = await parseBody(req, brandingSchema);
  if (!parsed.ok) return parsed.response;

  const updated = await updateOrganizationBranding(db, ctx.organizationId, parsed.data);
  await logAudit(db, { organizationId: ctx.organizationId, actorId: ctx.userId, actorType: "agency_user", action: "organization.branding_updated" });

  return NextResponse.json(updated);
}
