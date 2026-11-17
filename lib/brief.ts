// Campaign brief -> a ready-to-paste Claude Cowork prompt. Pure (no DOM, no DB), so it can be tested on its own.
import { TIERS, TIER_RANGE } from "./fields.ts";

export type Product = { name: string; about: string };
export type Row = { tier: string; count: number; budget: number }; // budget = max per creator, in the brief's currency
export type Brief = { client: string; products: Product[]; rows: Row[]; currency: string; other: string; message: string };

export const CONTACT_FACTOR = 3; // not everyone replies: reach out to ~3x the creators needed per tier

const short = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(n));
export const tierRange = (t: string) => {
  const [a, b] = TIER_RANGE[t];
  return b >= 1e9 ? `${short(a)}+` : a === 0 ? `under ${short(b)}` : `${short(a)}–${short(b)}`;
};
/** Same text format the app stores money in (lib/money.ts): "10k INR", "12,500 INR". */
export const money = (n: number, cur: string) => `${n >= 1000 && n % 1000 === 0 ? `${n / 1000}k` : n.toLocaleString("en-US")} ${cur}`;

/** Rows that are complete, one per tier, in tier order. */
export const cleanRows = (rows: Row[]) =>
  rows.filter((r) => TIER_RANGE[r.tier] && r.count > 0 && r.budget > 0).sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier));

export function buildPrompt(b: Brief, appUrl: string, apiKey = "") {
  const rows = cleanRows(b.rows);
  const products = b.products.filter((p) => p.name.trim());
  const cur = b.currency;
  const tierRates = Object.fromEntries(rows.map((r) => [r.tier, money(r.budget, cur)]));
  const maxBudget = Math.max(...rows.map((r) => r.budget));
  const minF = Math.min(...rows.map((r) => TIER_RANGE[r.tier][0])), maxF = Math.max(...rows.map((r) => TIER_RANGE[r.tier][1]));
  const total = rows.reduce((n, r) => n + r.count, 0), spend = rows.reduce((n, r) => n + r.count * r.budget, 0);
  const contact = rows.reduce((n, r) => n + r.count * CONTACT_FACTOR, 0);

  return `Read CLAUDE.md fully (especially "Requirement intake", "Money format", "Budget by tier", "Sending IG DMs", "Scheduled runs"). 
App: ${appUrl}
API key: ${apiKey || "API_KEY in .env.local"}
Send it on every /api call as the header  Authorization: Bearer <API key>  (base URL above).

=== CLIENT ===
${b.client.trim()}

=== PRODUCTS (${products.length}) ===
${products.map((p, i) => `${i + 1}. ${p.name.trim()}${p.about.trim() ? `: ${p.about.trim()}` : ""}`).join("\n")}

=== CREATORS WANTED ===
| Tier | Followers | How many | Max budget per creator |
|---|---|---|---|
${rows.map((r) => `| ${r.tier} | ${tierRange(r.tier)} | ${r.count} | ${money(r.budget, cur)} |`).join("\n")}
Total: ${total} creator${total === 1 ? "" : "s"}, up to ${money(spend, cur)} if every one is signed at the top of their budget.

=== OTHER REQUIREMENTS ===
${b.other.trim() || "None given. Don't invent any."}

=== MESSAGE (send exactly this, only the creator's name changes) ===
${b.message.trim() || "None given. Draft one short DM (under 400 chars) from the products above and show it to me. Do not save or send it until I approve it."}

Do this end to end:
0. POST /api/run/start {"kind":"campaign"}. On 423/409 stop and tell me why.
1. Save the client: POST /api/clients with name "${b.client.trim()}" and:
   - tierRates = ${JSON.stringify(tierRates)} (exactly this; the server enforces each tier's limit), maxRate = "${money(maxBudget, cur)}".
   - minFollowers = ${minF}, maxFollowers = ${maxF}.
   - offer = the products above plus anything in OTHER REQUIREMENTS, and what the creators will do and get. Nothing invented: no extra deliverables, payment terms, dates or exclusivity.
   - niches / related / locations from the products and requirements, following "Requirement intake". List your assumptions.
   - dmTemplate = my MESSAGE word for word (only a greeted name becomes {{name}}). If I gave none, skip this until I approve your draft.
2. Search: POST /api/search {clientId, want: ${Math.min(100, contact * 2)}}. Group the on-topic results by tier (from followers).
   Each tier needs about ${CONTACT_FACTOR}x its "How many" (not everyone replies): ${rows.map((r) => `${r.tier} ${r.count * CONTACT_FACTOR}`).join(", ")}.
   If a tier is short, hunt real creators for that tier only (public info, nothing invented, max 20 in total), push them, and search once more.
3. Show me the shortlist per tier (handle, followers, score, location) and how many each tier is short. WAIT for my OK before queueing anything.
4. After my OK: POST /api/outreach {creatorId, clientId, useTemplate:true, name:"<greeting name>"} for each approved creator. Then send:
   GET /api/outreach/next?limit=45 and send each DM in Chrome (60-180 s apart), POST /api/outreach/:id/sent after each. The cap is 45 DMs a day;
   leave the rest queued for tomorrow. If Instagram shows a challenge or block: POST /api/pause and stop.
5. POST /api/run/end. Report: assumptions, the template as stored, per tier: needed / found / hunted / queued / sent, and anything that failed.

Replies and negotiation are NOT done in this run. They run on the schedule (the "Replies" task on the Automation page), within each tier's budget above.`;
}

export type BriefInput = Brief & { followUp: string };

/** Pure: the client fields a brief fixes exactly. */
export function clientFieldsFromBrief(b: BriefInput) {
  const rows = cleanRows(b.rows);
  if (!b.client.trim()) throw new Error("client name required");
  if (!rows.length) throw new Error("add at least one creator row with a count and a budget");
  return {
    name: b.client.trim(),
    tierRates: Object.fromEntries(rows.map((r) => [r.tier, money(r.budget, b.currency)])),
    maxRate: money(Math.max(...rows.map((r) => r.budget)), b.currency),
    minFollowers: Math.min(...rows.map((r) => TIER_RANGE[r.tier][0])),
    maxFollowers: Math.max(...rows.map((r) => TIER_RANGE[r.tier][1])),
    ...(b.message.trim() && { dmTemplate: b.message.trim() }),
    ...(b.followUp.trim() && { followUpTemplate: b.followUp.trim() }),
  };
}
