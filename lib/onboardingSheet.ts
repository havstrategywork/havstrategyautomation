// Writes a submission straight to the agency's Google Sheet, which is the ONLY place the answers are kept: they are not saved in our database.
// WHERE it goes is set on the dashboard's Settings page (saved in the `settings` collection). ONBOARDING_SHEET_ID / ONBOARDING_SHEET_TAB still work as a fallback.
// The service account key (GOOGLE_SA_JSON) stays in the environment: it is a secret, so it is never stored in the database or shown on a page.
import { db } from "./db";
import { sheetHeader, sheetPairs, type Step, type Submission } from "./onboarding";
import { appendByTitle } from "./sheet";

export const SETTING_ID = "onboardingSheet";

/** The destination sheet, or null when no link is saved (or the service account key is missing). */
export async function sheetTarget() {
  const s = await (await db()).settings.findOne({ _id: SETTING_ID });
  const id = s?.sheetId || process.env.ONBOARDING_SHEET_ID;
  if (!id || !process.env.GOOGLE_SA_JSON) return null;
  return { id, tab: s?.tab || process.env.ONBOARDING_SHEET_TAB || "Onboarding", url: s?.sheetUrl ?? `https://docs.google.com/spreadsheets/d/${id}/edit` };
}

/** Adds one submission as a row. Throws when no sheet is set up or Google refuses it, so the form can say it was NOT received. */
export async function saveToSheet(submission: Submission, steps: readonly Step[]) {
  const target = await sheetTarget();
  if (!target) throw new Error("no Google Sheet is connected (check the Settings page and GOOGLE_SA_JSON)");
  await appendByTitle(target.id, target.tab, sheetHeader(steps), sheetPairs(submission, steps));
}
