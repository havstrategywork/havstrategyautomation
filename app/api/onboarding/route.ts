import { createHash } from "node:crypto";
import { after } from "next/server";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { validate } from "@/lib/onboarding";
import { pushToSheet } from "@/lib/onboardingSheet";
import { pushToNotion } from "@/lib/notionBrief";

// PUBLIC endpoint (the onboarding page posts here; no login, no Bearer key). So it is defensive: size cap, honeypot, per-IP limit, strict validation.
// The answer is saved first; the Google Sheet push runs after the response and its result is recorded on the submission.
const MAX_BYTES = 200_000, PER_HOUR = 5;

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "That is too much text to submit at once." }, { status: 413 });
  let body: { hp?: unknown };
  try { body = JSON.parse(text); } catch { return Response.json({ error: "Bad request." }, { status: 400 }); }
  if (body.hp) return Response.json({ ok: true }); // a bot filled the hidden field: pretend it worked, store nothing

  const v = validate(body);
  if (!v.ok) return Response.json({ error: v.error }, { status: 422 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = createHash("sha256").update(`${process.env.API_KEY ?? ""}|${ip}`).digest("hex").slice(0, 24); // not stored in clear
  const { onboarding } = await db();
  if (await onboarding.countDocuments({ ipHash, at: { $gte: new Date(Date.now() - 3600e3) } }) >= PER_HOUR)
    return Response.json({ error: "Too many submissions from this connection. Please try again in an hour." }, { status: 429 });

  const at = new Date();
  const { insertedId } = await onboarding.insertOne({ at, services: v.services, answers: v.answers, ipHash });
  after(async () => {
    await pushToSheet(insertedId);
    await pushToNotion(insertedId);
    await notify(`New onboarding: ${v.answers.company}`, `${v.answers.name} (${v.answers.email}) · ${v.services.join(", ")}`);
  });
  return Response.json({ ok: true });
}
