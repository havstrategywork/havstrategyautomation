import { NextResponse } from "next/server";
import { getCurrentSession, type AuthContext } from "@/lib/access/auth/session";
import { can, type Capability } from "@/lib/access/auth/rbac";
import { getDb, type AnyDb } from "@/lib/access/db";

export type Guarded<T> = T | NextResponse;

function isResponse<T>(value: Guarded<T>): value is NextResponse {
  return value instanceof NextResponse;
}

export { isResponse };

/** Every /api/* handler below /api/public/* should start with this. */
export async function withSession(): Promise<Guarded<{ ctx: AuthContext; db: AnyDb }>> {
  // CSRF: the dashboard cookie is SameSite=Strict, so another site cannot make a signed-in browser send it.
  const ctx = await getCurrentSession();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const dbResult = await getDb();
  if (!dbResult.ok) return NextResponse.json({ error: dbResult.error }, { status: 503 });

  return { ctx, db: dbResult.db };
}

export async function withCapability(capability: Capability): Promise<Guarded<{ ctx: AuthContext; db: AnyDb }>> {
  const result = await withSession();
  if (isResponse(result)) return result;
  if (!can(result.ctx.role, capability)) {
    return NextResponse.json({ error: "Your role cannot perform this action." }, { status: 403 });
  }
  return result;
}

/** For public, token-scoped endpoints (client onboarding, OAuth callbacks) that need the DB but no agency session. */
export async function withDb(): Promise<Guarded<{ db: AnyDb }>> {
  const dbResult = await getDb();
  if (!dbResult.ok) return NextResponse.json({ error: dbResult.error }, { status: 503 });
  return { db: dbResult.db };
}
