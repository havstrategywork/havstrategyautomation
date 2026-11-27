import { after } from "next/server";
import { clientIpFromHeaders, rateLimit } from "@/lib/access/rate-limit";
import { notify } from "@/lib/notify";
import { asked, validate } from "@/lib/onboarding";
import { getForm } from "@/lib/onboardingForm";
import { saveToSheet } from "@/lib/onboardingSheet";
import { pushToNotion } from "@/lib/notionBrief";

// PUBLIC endpoint (the onboarding page posts here; no login, no Bearer key). So it is defensive: size cap, honeypot, per-IP limit, strict validation.
// The Google Sheet is the only record: the row is added BEFORE we answer, and a failure is shown to the client (their answers stay in their browser).
// The Notion brief and the notification run after the response.
const MAX_BYTES = 200_000, PER_HOUR = 5;

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "That is too much text to submit at once." }, { status: 413 });
  let body: { hp?: unknown; version?: unknown };
  try { body = JSON.parse(text); } catch { return Response.json({ error: "Bad request." }, { status: 400 }); }
  if (body.hp) return Response.json({ ok: true }); // a bot filled the hidden field: pretend it worked, store nothing

  const form = await getForm();
  const v = validate(body, form.steps);
  if (!v.ok) {
    // The form may have been edited while this client was filling it in: tell them to reload rather than show a puzzling error.
    if (body.version !== form.version) return Response.json({ error: "This form was just updated. Please refresh the page - your answers are saved in this browser." }, { status: 409 });
    return Response.json({ error: v.error }, { status: 422 });
  }

  // ponytail: in-memory per-instance limit (lib/access/rate-limit.ts); swap for a shared store if abuse shows up across instances
  if (!rateLimit(`onboarding:${clientIpFromHeaders(req.headers)}`, PER_HOUR, 3600e3).allowed)
    return Response.json({ error: "Too many submissions from this connection. Please try again in an hour." }, { status: 429 });

  const sub = { at: new Date(), services: v.services, answers: v.answers, questions: asked(form.steps, v.services) };
  try { await saveToSheet(sub); }
  catch (e) {
    console.error("onboarding: could not save to the Google Sheet:", (e as Error).message);
    await notify("Onboarding NOT saved", `${v.answers.company} (${v.answers.email}) tried to submit but the Google Sheet failed: ${(e as Error).message}`);
    return Response.json({ error: "We couldn't save your answers just now. Please try again in a few minutes - your answers are still in this browser." }, { status: 503 });
  }
  after(async () => {
    await pushToNotion(sub);
    await notify(`New onboarding: ${v.answers.company}`, `${v.answers.name} (${v.answers.email}) · ${v.services.join(", ")}`);
  });
  return Response.json({ ok: true });
}
