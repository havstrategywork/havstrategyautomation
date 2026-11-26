"use server";
import { revalidatePath } from "next/cache";
import { saveForm } from "@/lib/onboardingForm";
import { currentUser } from "@/lib/session";

// The proxy already blocks this page for non-admins, but a server action must never trust that alone.
export async function saveOnboardingForm(stepsJson: string, baseVersion: number) {
  const me = await currentUser();
  if (me?.role !== "admin") return { ok: false as const, error: "Sign in as an admin to change the form." };
  if (stepsJson.length > 400_000) return { ok: false as const, error: "The form is too large to save." };
  let steps: unknown;
  try { steps = JSON.parse(stepsJson); } catch { return { ok: false as const, error: "Could not read the form. Reload the page and try again." }; }
  const result = await saveForm(steps, Number.isInteger(baseVersion) && baseVersion >= 0 ? baseVersion : -1, me.username);
  if (result.ok) { revalidatePath("/onboarding-form"); revalidatePath("/onboarding-responses"); }
  return result;
}
