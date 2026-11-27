import { createHash } from "node:crypto";
import { after } from "next/server";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { asked, validate } from "@/lib/onboarding";
import { getForm } from "@/lib/onboardingForm";
import { saveToSheet } from "@/lib/onboardingSheet";
import { pushToNotion } from "@/lib/notionBrief";

// PUBLIC endpoint (the onboarding page posts here; no login, no Bearer key). So it is defensive: size cap, honeypot, per-IP limit, strict validation.
// Answers go straight to the Google Sheet and are NOT saved in our database. The client is told "received" only after Google has taken the row;
// if it fails, nothing is kept here and their draft stays in their browser to send again. All we keep is a hashed address and a time for an hour (rate limit).
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

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = createHash("sha256").update(`${process.env.API_KEY ?? ""}|${ip}`).digest("hex").slice(0, 24); // not stored in clear
  const { onboardingHits } = await db();
  const at = new Date();
  const { insertedId } = await onboardingHits.insertOne({ ipHash, at }); // take the slot first, so parallel requests can't all slip under the limit
  const release = () => onboardingHits.deleteOne({ _id: insertedId });
  if (await onboardingHits.countDocuments({ ipHash, at: { $gte: new Date(+at - 3600e3) } }) > PER_HOUR) {
    await release();
    return Response.json({ error: "Too many submissions from this connection. Please try again in an hour." }, { status: 429 });
  }

  const submission = { at, services: v.services, answers: v.answers, questions: asked(form.steps, v.services) };
  try {
    await saveToSheet(submission, form.steps);
  } catch (e) {
    await release(); // a failed send doesn't count against the client
    const reason = (e as Error).message.slice(0, 300);
    console.error("onboarding: could not write to the Google Sheet:", reason);
    after(() => notify("Onboarding form is not reaching the Google Sheet", reason));
    return Response.json({ error: "We couldn't send your answers just now. They are saved in this browser, so please try again in a few minutes." }, { status: 502 });
  }
  after(async () => {
    await pushToNotion(submission);
    await notify(`New onboarding: ${v.answers.company}`, `${v.answers.name} (${v.answers.email}) · ${v.services.join(", ")}`);
  });
  return Response.json({ ok: true });
}
