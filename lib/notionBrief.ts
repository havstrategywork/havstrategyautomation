// Posts a condensed "brief" page to Notion for each onboarding submission: just the handful of answers a strategist needs
// before kickoff, not the full 50+ question dump (that lives in the Google Sheet and the Onboarding admin page). Where it
// goes is set on the dashboard's Settings page (saved in the `settings` collection, _id "onboardingNotion"). NOTION_PARENT_PAGE_ID
// is a fallback, same pattern as lib/onboardingSheet.ts's ONBOARDING_SHEET_ID.
import type { ObjectId } from "mongodb";
// Explicit .ts extensions here (unlike the rest of this codebase) so this file's pure logic (briefBlocks/briefTitle) can be
// run and tested directly with plain `node`, which — unlike Next's bundler — won't resolve a bare specifier like "./db".
import { db, type Onboarding } from "./db.ts";
import { SERVICES, type ServiceId } from "./onboarding.ts";
import { bullet, type Block, callout, createBriefPage, divider, h2, p as para } from "./notion.ts";

export const NOTION_SETTING_ID = "onboardingNotion";

/** The destination page, or null when no link is saved (or NOTION_API_KEY is missing). */
export async function briefTarget() {
  const s = await (await db()).settings.findOne({ _id: NOTION_SETTING_ID });
  const id = s?.pageId || process.env.NOTION_PARENT_PAGE_ID;
  if (!id || !process.env.NOTION_API_KEY) return null;
  return { id, title: s?.pageTitle, url: s?.pageUrl };
}

const g = (a: Record<string, string>, id: string) => (a[id] ?? "").trim();
const svc = (id: ServiceId) => SERVICES.find((s) => s.id === id)!.label;
// one goal-shaped question per service, so the brief gets a single "what they want" line for each chosen service
const GOAL: Partial<Record<ServiceId, string>> = { social: "smPurpose", creator: "crGoal", google: "gObjective", meta: "mObjective", seo: "sKeywords" };

/** A bullet (or paragraph) for one field, or nothing if the client left it blank. */
function row(a: Record<string, string>, label: string, id: string, kind: "bullet" | "p" = "bullet"): Block[] {
  const v = g(a, id);
  return v ? [kind === "bullet" ? bullet(`${label}: ${v}`) : para(`${label}: ${v}`)] : [];
}

/** The condensed brief's blocks: contact, chosen services, a short business/brand/customer snapshot, one goal line per
 *  service, and budget if given. Deliberately NOT every question — the Google Sheet and the Onboarding admin page have those. */
export function briefBlocks(services: ServiceId[], a: Record<string, string>): Block[] {
  const blocks: Block[] = [
    h2("Contact"),
    ...row(a, "Name", "name"), ...row(a, "Email", "email"), ...row(a, "Company", "company"), ...row(a, "Website", "website"), ...row(a, "Phone", "phone"),
    h2("Services requested"), bullet(services.map(svc).join(", ")),
    h2("Business snapshot"),
    ...row(a, "Where they are", "where", "p"), ...row(a, "What to focus on", "focus", "p"), ...row(a, "Competitors", "competitors", "p"), ...row(a, "What sets them apart", "different", "p"),
    h2("Brand snapshot"),
    ...row(a, "Vision", "vision"), ...row(a, "Personality", "personality"), ...row(a, "Message", "message"), ...row(a, "Wants audience to feel", "feel"),
    h2("Customer snapshot"),
    ...row(a, "Ideal customers", "ideal", "p"), ...row(a, "Where based", "geo"), ...row(a, "Pain points", "pain", "p"),
  ];
  const goals = services.flatMap((s) => (GOAL[s] ? row(a, svc(s), GOAL[s]!) : []));
  if (goals.length) blocks.push(h2("What they want from each service"), ...goals);
  const budget = g(a, "budget") || g(a, "crBudget");
  if (budget) blocks.push(h2("Budget"), para(budget));
  blocks.push(divider(), callout("Every answer, including files, is in the Onboarding page of the dashboard and the Google Sheet."));
  return blocks;
}

export const briefTitle = (a: Record<string, string>, at: Date) => `${a.company || a.name || "New client"} — ${at.toISOString().slice(0, 10)}`;

/** Never throws: same pattern as pushToSheet — a Notion outage must not lose or fail a submission (it's already saved;
 *  Settings / the retry button on Onboarding can push it again). */
export async function pushToNotion(id: ObjectId) {
  const target = await briefTarget();
  if (!target) return;
  const { onboarding } = await db();
  const doc = await onboarding.findOne({ _id: id, "notion.ok": { $ne: true } }); // never push a page twice
  if (!doc) return;
  let notion: Onboarding["notion"];
  try {
    const page = await createBriefPage(target.id, briefTitle(doc.answers, doc.at), briefBlocks(doc.services as ServiceId[], doc.answers));
    notion = { ok: true, at: new Date(), url: page.url };
  } catch (e) {
    notion = { ok: false, at: new Date(), error: (e as Error).message.slice(0, 300) };
  }
  await onboarding.updateOne({ _id: id }, { $set: { notion } });
}

/** Pushes every submission that doesn't have a brief yet, oldest first. Returns how many were tried. */
export async function pushUnsentNotion() {
  const { onboarding } = await db();
  const ids = await onboarding.find({ "notion.ok": { $ne: true } }).sort({ at: 1 }).limit(200).project<{ _id: ObjectId }>({ _id: 1 }).toArray();
  for (const d of ids) await pushToNotion(d._id);
  return ids.length;
}
