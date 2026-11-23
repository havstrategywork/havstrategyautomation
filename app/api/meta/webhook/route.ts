import { handleWebhook } from "@/lib/bot";
import { cfg, validSignature } from "@/lib/meta";

// Meta calls this (no login, no API key: it is authenticated by the app-secret signature). Set it as the Instagram webhook callback URL in the Meta app.
// GET = the one-time verification handshake; POST = message events, answered only if the X-Hub-Signature-256 header matches the raw body.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams, c = cfg();
  return q.get("hub.mode") === "subscribe" && c.verifyToken && q.get("hub.verify_token") === c.verifyToken
    ? new Response(q.get("hub.challenge") ?? "", { status: 200 })
    : new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("Forbidden", { status: 403 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new Response("Bad request", { status: 400 }); }
  await handleWebhook(body); // errors are caught per event inside; Meta always gets a 200 so it does not retry for 36 hours
  return new Response("EVENT_RECEIVED", { status: 200 });
}
