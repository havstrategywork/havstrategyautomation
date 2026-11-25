/**
 * Email sending. If EMAIL_API_KEY is unset, every send is a safe no-op that
 * logs instead (both demo and production) - in-app notifications still work
 * normally either way, matching the spec's "fails safely" requirement.
 *
 * The concrete provider wired in here is Resend (https://resend.com/docs/api-reference/emails/send-email),
 * chosen because EMAIL_API_KEY/EMAIL_FROM_ADDRESS in the spec's env list
 * don't name a specific vendor and Resend's send-email endpoint is a single,
 * stable, well-documented REST call - swap sendViaProvider() for another
 * vendor's API without touching any call site.
 */

export type SendEmailResult = { ok: true; skipped?: boolean } | { ok: false; error: string };

export async function sendEmail(input: { to: string; subject: string; html: string; text?: string }): Promise<SendEmailResult> {
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS || "onboarding@youragency.com";

  if (!apiKey) {
    console.log(`[email:skipped - no EMAIL_API_KEY] to=${input.to} subject="${input.subject}"`);
    return { ok: true, skipped: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Email provider returned ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown email send error." };
  }
}

export async function pingOpsWebhook(message: string): Promise<void> {
  const url = process.env.NOTIFY_URL;
  if (!url) return;
  try {
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: message, message }) });
  } catch {
    // Best-effort only - never let an ops-notification failure affect the request.
  }
}
