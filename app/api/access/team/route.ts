import { NextResponse } from "next/server";
import { db as mongo } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { isResponse, withCapability, withSession } from "@/lib/access/api/guard";
import { parseBody } from "@/lib/access/api/validate";
import { createTeamMemberSchema } from "@/lib/access/validation/auth";
import { listOrganizationMembers } from "@/lib/access/db/queries/users";
import { ensureHubUser, ensureOrganization, syncAllUsers } from "@/lib/access/auth/session";
import { roleOfHub } from "@/lib/roles";
import { logAudit } from "@/lib/access/audit";

/** Any signed-in role can read the roster (needed for the "assigned manager" picker); only manage_team can write it. */
export async function GET() {
  const guard = await withSession();
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;
  await syncAllUsers(db); // the roster is the dashboard's user list: one login for everything
  return NextResponse.json(await listOrganizationMembers(db, ctx.organizationId));
}

/** Adds a person to the ONE login: they sign in on the normal login page (email + this password) and see the Access Hub per their role. */
export async function POST(req: Request) {
  const guard = await withCapability("manage_team");
  if (isResponse(guard)) return guard;
  const { ctx, db } = guard;

  const parsed = await parseBody(req, createTeamMemberSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const { users } = await mongo();
  if (await users.findOne({ $or: [{ username: input.email }, { email: input.email }] })) return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
  await users.insertOne({ username: input.email, email: input.email, role: roleOfHub(input.role), passwordHash: await hashPassword(input.password), createdAt: new Date() });
  const org = await ensureOrganization(db);
  const hub = await ensureHubUser(db, org, { username: input.email, email: input.email, role: roleOfHub(input.role) });
  const user = hub!.user;

  await logAudit(db, { organizationId: ctx.organizationId, actorId: ctx.userId, actorType: "agency_user", action: "team.member_added", metadata: { role: input.role } });
  return NextResponse.json({ id: user.id }, { status: 201 });
}
