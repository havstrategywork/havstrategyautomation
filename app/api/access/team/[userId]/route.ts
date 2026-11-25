import { NextResponse } from "next/server";
import { db as mongo } from "@/lib/db";
import { isResponse, withCapability } from "@/lib/access/api/guard";
import { parseBody } from "@/lib/access/api/validate";
import { updateMemberRoleSchema } from "@/lib/access/validation/auth";
import { getMembership, getUserById, removeMember, updateMemberRole } from "@/lib/access/db/queries/users";
import { toMainRole } from "@/lib/roles";
import { logAudit } from "@/lib/access/audit";

// The dashboard user (MongoDB) is the source of truth for a person's role and login; the Hub membership just mirrors it.
const mainUser = async (email: string) =>
  (await mongo()).users.findOne({ $or: [{ email }, { username: email }, { username: email.replace(/@havstrategy\.local$/, "") }] });

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const guard = await withCapability("manage_team");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { userId } = await params;

  const parsed = await parseBody(req, updateMemberRoleSchema);
  if (!parsed.ok) return parsed.response;

  const membership = await getMembership(db, ctx.organizationId, userId);
  const target = membership && (await getUserById(db, userId));
  if (!membership || !target) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  if (userId === ctx.userId) return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });

  const u = await mainUser(target.email);
  if (u) await (await mongo()).users.updateOne({ _id: u._id }, { $set: { role: toMainRole(parsed.data.role) } });
  await updateMemberRole(db, ctx.organizationId, userId, parsed.data.role);
  await logAudit(db, { organizationId: ctx.organizationId, actorId: ctx.userId, actorType: "agency_user", action: "team.role_updated", metadata: { targetUserId: userId, role: parsed.data.role } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const guard = await withCapability("manage_team");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  const { userId } = await params;

  if (userId === ctx.userId) return NextResponse.json({ error: "You cannot remove your own account." }, { status: 400 });
  const membership = await getMembership(db, ctx.organizationId, userId);
  const target = membership && (await getUserById(db, userId));
  if (!membership || !target) return NextResponse.json({ error: "Team member not found." }, { status: 404 });

  // Removing someone removes their login for the whole platform (dashboard + Access Hub) and signs them out everywhere.
  const u = await mainUser(target.email);
  if (u) {
    const m = await mongo();
    await m.users.deleteOne({ _id: u._id });
    await m.sessions.deleteMany({ userId: u._id! });
  }
  await removeMember(db, ctx.organizationId, userId);
  await logAudit(db, { organizationId: ctx.organizationId, actorId: ctx.userId, actorType: "agency_user", action: "team.member_removed", metadata: { targetUserId: userId } });
  return NextResponse.json({ ok: true });
}
