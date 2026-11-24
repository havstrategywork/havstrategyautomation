// Pushes one saved onboarding submission to the agency's Google Sheet, and records whether it worked on the submission itself.
// Env: ONBOARDING_SHEET_ID = the Google Sheet's id (the long part of its URL), shared with the GOOGLE_SA_JSON service account as Editor.
// ONBOARDING_SHEET_TAB = tab name (default "Onboarding"), created with its header row on first use.
import type { ObjectId } from "mongodb";
import { db } from "./db";
import { HEADER, toRow, type ServiceId } from "./onboarding";
import { appendRow } from "./sheet";

export const sheetConfigured = () => !!process.env.ONBOARDING_SHEET_ID && !!process.env.GOOGLE_SA_JSON;

/** Never throws: a Google outage must not lose or fail a submission (it is already in our database; the admin page can push it again). */
export async function pushToSheet(id: ObjectId) {
  if (!sheetConfigured()) return;
  const { onboarding } = await db();
  const doc = await onboarding.findOne({ _id: id, "sheet.ok": { $ne: true } }); // never push a row twice
  if (!doc) return;
  let sheet: { ok: boolean; at: Date; error?: string };
  try {
    await appendRow(process.env.ONBOARDING_SHEET_ID!, process.env.ONBOARDING_SHEET_TAB || "Onboarding", HEADER, toRow(doc.at, doc.services as ServiceId[], doc.answers));
    sheet = { ok: true, at: new Date() };
  } catch (e) {
    sheet = { ok: false, at: new Date(), error: (e as Error).message.slice(0, 300) };
  }
  await onboarding.updateOne({ _id: id }, { $set: { sheet } });
}
