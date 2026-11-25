import { randomUUID } from "node:crypto";
import { NO_ID, type AnyDb } from "@/lib/access/db";
import type { Organization } from "@/lib/access/db/schema-types";

export const ORG_NAME = "Havstrategy";

/** The single organisation every dashboard user belongs to (created on first use). */
export async function ensureOrganization(db: AnyDb): Promise<Organization> {
  const existing = await db.organizations.findOne({}, NO_ID);
  if (existing) return existing;
  try {
    await db.organizations.insertOne({ id: randomUUID(), organizationName: ORG_NAME, logoUrl: null, settings: {}, createdAt: new Date() });
  } catch {
    // a parallel first request created it already
  }
  return (await db.organizations.findOne({}, { ...NO_ID, sort: { createdAt: 1 } }))!;
}

export async function getOrganizationById(db: AnyDb, organizationId: string) {
  return db.organizations.findOne({ id: organizationId }, NO_ID);
}

export async function updateOrganizationBranding(
  db: AnyDb,
  organizationId: string,
  patch: { organizationName?: string; logoUrl?: string | null; settings?: Record<string, unknown> },
) {
  const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(set).length === 0) return getOrganizationById(db, organizationId);
  return db.organizations.findOneAndUpdate({ id: organizationId }, { $set: set }, { returnDocument: "after", ...NO_ID });
}
