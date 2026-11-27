// Appends one onboarding submission to the agency's Google Sheet. The sheet is the ONLY place answers are stored (nothing goes in MongoDB).
// WHERE it goes is set on the dashboard's Settings page (saved in the `settings` collection). ONBOARDING_SHEET_ID / ONBOARDING_SHEET_TAB still work as a fallback.
// The service account key (GOOGLE_SA_JSON) stays in the environment: it is a secret, so it is never stored in the database or shown on a page.
import { db } from "./db";
import { sheetHeader, sheetPairs, type Submission } from "./onboarding";
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

/** Throws when there is no sheet or Google refuses: the caller must tell the client, because nothing else keeps their answers. */
export async function saveToSheet(sub: Submission) {
  const target = await sheetTarget();
  if (!target) throw new Error("no sheet connected");
  const { steps } = await getForm();
  await appendByTitle(target.id, target.tab, sheetHeader(steps), sheetPairs(sub, steps));
}
