// Copies one saved onboarding submission to the agency's Google Sheet, and records whether it worked on the submission itself. MongoDB stays the record.
// WHERE it goes is set on the dashboard's Settings page (saved in the `settings` collection). ONBOARDING_SHEET_ID / ONBOARDING_SHEET_TAB still work as a fallback.
// The service account key (GOOGLE_SA_JSON) stays in the environment: it is a secret, so it is never stored in the database or shown on a page.
import type { ObjectId } from "mongodb";
import { db } from "./db";
import { sheetHeader, sheetPairs } from "./onboarding";
import { getForm } from "./onboardingForm";
import { appendByTitle } from "./sheet";

export const SETTING_ID = "onboardingSheet";

/** The destination sheet, or null when no link is saved (or the service account key is missing). */
export async function sheetTarget() {
  const s = await (await db()).settings.findOne({ _id: SETTING_ID });
  const id = s?.sheetId || process.env.ONBOARDING_SHEET_ID;
  if (!id || !process.env.GOOGLE_SA_JSON) return null;
  return { id, tab: s?.tab || process.env.ONBOARDING_SHEET_TAB || "Onboarding", url: s?.sheetUrl ?? `https://docs.google.com/spreadsheets/d/${id}/edit` };
}

/** Never throws: a Google outage must not lose or fail a submission (it is already in our database; the Onboarding page can push it again). */
export async function pushToSheet(id: ObjectId) {
  const target = await sheetTarget();
  if (!target) return;
  const { onboarding } = await db();
  const doc = await onboarding.findOne({ _id: id, "sheet.ok": { $ne: true } }); // never push a row twice
  if (!doc) return;
  let sheet: { ok: boolean; at: Date; error?: string };
  try {
    const { steps } = await getForm();
    await appendByTitle(target.id, target.tab, sheetHeader(steps), sheetPairs(doc, steps));
    sheet = { ok: true, at: new Date() };
  } catch (e) {
    sheet = { ok: false, at: new Date(), error: (e as Error).message.slice(0, 300) };
  }
  await onboarding.updateOne({ _id: id }, { $set: { sheet } });
}

/** Pushes every submission that is not in the sheet yet, oldest first. Returns how many were tried. */
export async function pushUnsent() {
  const { onboarding } = await db();
  const ids = await onboarding.find({ "sheet.ok": { $ne: true } }).sort({ at: 1 }).limit(200).project<{ _id: ObjectId }>({ _id: 1 }).toArray();
  for (const d of ids) await pushToSheet(d._id);
  return ids.length;
}
