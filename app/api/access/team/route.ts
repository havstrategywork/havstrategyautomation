import { NextResponse } from "next/server";
import { db as mongo } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { FORM_ADMIN, FORM_ADMIN_LOCKED, roleOfHub } from "@/lib/roles";
import { isResponse, withCapability, withSession } from "@/lib/access/api/guard";
import { parseBody } from "@/lib/access/api/validate";
import { createTeamMemberSchema } from "@/lib/access/validation/auth";
import { listOrganizationMembers } from "@/lib/access/db/queries/users";
import { logAudit } from "@/lib/access/audit";

/** Any signed-in role can read the roster (needed for the "assigned manager" picker); only manage_team can write it. The roster IS the dashboard's logins. */
export async function GET() {
  const guard = await withSession();
  if (isResponse(guard)) return guard;
  return NextResponse.json(await listOrganizationMembers());
}

/** Adds a person to the ONE login: they sign in on the normal login page (email + this password) and see the Access Hub per their role. */
export async function POST(req: Request) {
  const guard = await withCapability("manage_team");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;

  const parsed = await parseBody(req, createTeamMemberSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  if (input.email === FORM_ADMIN) return NextResponse.json({ error: FORM_ADMIN_LOCKED }, { status: 403 }); // nobody else may set that account's password

  const { users } = await mongo();
  if (await users.findOne({ $or: [{ username: input.email }, { email: input.email }] })) return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
  const created = await users.insertOne({ username: input.email, email: input.email, role: roleOfHub(input.role), passwordHash: await hashPassword(input.password), createdAt: new Date() });

  await logAudit(db, { organizationId: ctx.organizationId, actorId: ctx.userId, actorType: "agency_user", action: "team.member_added", metadata: { role: input.role } });
  return NextResponse.json({ id: String(created.insertedId) }, { status: 201 });
}
