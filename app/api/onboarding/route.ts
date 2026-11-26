import { createHash } from "node:crypto";
import { after } from "next/server";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { asked, validate } from "@/lib/onboarding";
import { getForm } from "@/lib/onboardingForm";
import { pushToNotion } from "@/lib/notionBrief";

// PUBLIC endpoint (the onboarding page posts here; no login, no Bearer key). So it is defensive: size cap, honeypot, per-IP limit, strict validation.
// Answers are stored in MongoDB; the Notion brief and the notification run after the response.
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
  const { onboarding } = await db();
  if (await onboarding.countDocuments({ ipHash, at: { $gte: new Date(Date.now() - 3600e3) } }) >= PER_HOUR)
    return Response.json({ error: "Too many submissions from this connection. Please try again in an hour." }, { status: 429 });

  const at = new Date();
  const { insertedId } = await onboarding.insertOne({ at, services: v.services, answers: v.answers, questions: asked(form.steps, v.services), formVersion: form.version, ipHash });
  after(async () => {
    await pushToNotion(insertedId);
    await notify(`New onboarding: ${v.answers.company}`, `${v.answers.name} (${v.answers.email}) · ${v.services.join(", ")}`);
  });
  return Response.json({ ok: true });
}
