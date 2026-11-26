// The live onboarding form, stored in MongoDB (collection `onboardingForm`, one document). Admins edit it on the "Form editor" page;
// until the first save, the built-in DEFAULT_STEPS are the form.
import { db } from "./db";
import { DEFAULT_STEPS, validateForm, type Step } from "./onboarding";

const ID = "form";

export async function getForm(): Promise<{ steps: Step[]; version: number; updatedAt?: Date; by?: string }> {
  const doc = await (await db()).onboardingForm.findOne({ _id: ID });
  return doc ? { steps: doc.steps, version: doc.version, updatedAt: doc.updatedAt, by: doc.by } : { steps: DEFAULT_STEPS, version: 0 };
}

/** Saves an edited form. `baseVersion` is the version the editor started from, so two admins can't silently overwrite each other. */
export async function saveForm(input: unknown, baseVersion: number, by: string): Promise<{ ok: true; version: number; steps: Step[] } | { ok: false; error: string }> {
  const checked = validateForm(input);
  if (!checked.ok) return checked;
  const conflict = { ok: false as const, error: "Someone else saved the form while you were editing. Reload the page to get their version, then make your changes again." };
  const { onboardingForm } = await db();
  const next = { steps: checked.steps, version: baseVersion + 1, updatedAt: new Date(), by };
  if (baseVersion === 0) {
    try {
      await onboardingForm.insertOne({ _id: ID, ...next });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return conflict;
      throw e;
    }
  } else if (!(await onboardingForm.updateOne({ _id: ID, version: baseVersion }, { $set: next })).matchedCount) return conflict;
  return { ok: true, version: next.version, steps: next.steps };
}
