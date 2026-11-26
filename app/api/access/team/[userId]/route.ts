import { NextResponse } from "next/server";
import { db as mongo } from "@/lib/db";
import { FORM_ADMIN_LOCKED, isFormAdminAccount, roleOfHub } from "@/lib/roles";
import { isResponse, withCapability } from "@/lib/access/api/guard";
import { parseBody } from "@/lib/access/api/validate";
import { updateMemberRoleSchema } from "@/lib/access/validation/auth";
import { getMemberById } from "@/lib/access/db/queries/users";
import { logAudit } from "@/lib/access/audit";

// The dashboard login (MongoDB `users`) is the one source of truth for a person's role and password; the Hub just reads it.

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const guard = await withCapability("manage_team");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { userId } = await params;

  const parsed = await parseBody(req, updateMemberRoleSchema);
  if (!parsed.ok) return parsed.response;

  const target = await getMemberById(userId);
  if (!target) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  if (userId === ctx.userId) return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });
  if (isFormAdminAccount(target.user)) return NextResponse.json({ error: FORM_ADMIN_LOCKED }, { status: 403 });

  await (await mongo()).users.updateOne({ _id: target.user._id }, { $set: { role: roleOfHub(parsed.data.role) } });
  await logAudit(db, { organizationId: ctx.organizationId, actorId: ctx.userId, actorType: "agency_user", action: "team.role_updated", metadata: { targetUserId: userId, role: parsed.data.role } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const guard = await withCapability("manage_team");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { userId } = await params;

  if (userId === ctx.userId) return NextResponse.json({ error: "You cannot remove your own account." }, { status: 400 });
  const target = await getMemberById(userId);
  if (!target) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  if (isFormAdminAccount(target.user)) return NextResponse.json({ error: FORM_ADMIN_LOCKED }, { status: 403 });

  // Removing someone removes their login for the whole platform (dashboard + Access Hub) and signs them out everywhere.
  const m = await mongo();
  await m.users.deleteOne({ _id: target.user._id });
  await m.sessions.deleteMany({ userId: target.user._id! });
  await logAudit(db, { organizationId: ctx.organizationId, actorId: ctx.userId, actorType: "agency_user", action: "team.member_removed", metadata: { targetUserId: userId } });
  return NextResponse.json({ ok: true });
}
