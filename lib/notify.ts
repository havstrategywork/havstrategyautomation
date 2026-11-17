// Pings a human when the automation needs one. NOTIFY_URL picks the channel:
//   https://ntfy.sh/<long-random-topic>   phone push via the free ntfy app (no account)   <- simplest
//   https://discord.com/api/webhooks/...  Discord channel
//   https://hooks.slack.com/...           Slack channel
// Unset = silent. Never throws and never waits more than 5s: a notification must not break the request that triggered it.
// ponytail: fire-and-forget, no retry queue; the dashboard is still the source of truth.
export async function notify(title: string, body = "") {
  const url = process.env.NOTIFY_URL;
  if (!url) return;
  const link = process.env.APP_URL ?? "";
  const text = `${title}${body ? `\n${body}` : ""}${link ? `\n${link}` : ""}`.slice(0, 1800);
  try {
    const json = /discord\.com|slack\.com/.test(url);
    await fetch(url, {
      method: "POST",
      headers: json ? { "Content-Type": "application/json" } : { Title: title.replace(/[^\x20-\x7e]/g, "").slice(0, 120), Tags: "robot" },
      body: json ? JSON.stringify(/discord/.test(url) ? { content: text } : { text }) : text,
      signal: AbortSignal.timeout(5000),
    });
  } catch {} // the event is already saved in the DB; a lost ping is not worth failing over
}
