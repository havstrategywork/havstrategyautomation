import assert from "node:assert/strict";
import { briefBlocks, briefTitle } from "./notionBrief.ts";

const type = (b: Record<string, unknown>) => b.type as string;
const text = (b: Record<string, unknown>) => { const t = type(b); return ((b[t] as { rich_text: { text: { content: string } }[] }).rich_text[0].text.content); };

// a blank field is skipped entirely, not emitted as an empty bullet
const blocks = briefBlocks(["seo"], { name: "Asha", email: "a@b.co", company: "Brand Co", sKeywords: "pizza delivery" });
assert.ok(blocks.some((b) => type(b) === "heading_2" && text(b) === "Contact"));
assert.ok(blocks.some((b) => type(b) === "bulleted_list_item" && text(b) === "Name: Asha"));
assert.ok(!blocks.some((b) => type(b) === "bulleted_list_item" && text(b).startsWith("Phone:"))); // phone left blank: no row at all
assert.ok(blocks.some((b) => type(b) === "bulleted_list_item" && text(b) === "SEO")); // the one chosen service, by its label
assert.ok(blocks.some((b) => type(b) === "heading_2" && text(b) === "What they want from each service"));
assert.ok(blocks.some((b) => type(b) === "bulleted_list_item" && text(b) === "SEO: pizza delivery")); // the per-service goal line, from sKeywords
assert.ok(!blocks.some((b) => type(b) === "heading_2" && text(b) === "Budget")); // no budget answer given: no Budget section at all
assert.equal(type(blocks[blocks.length - 1]), "callout"); // always ends with the link back to the full record
assert.equal(type(blocks[blocks.length - 2]), "divider");

// several chosen services each get their own goal line, in the order they were chosen
const multi = briefBlocks(["social", "google"], { name: "A", email: "a@b.co", company: "C", smPurpose: "brand awareness", gObjective: "leads" });
const goalLines = multi.filter((b) => type(b) === "bulleted_list_item").map(text);
assert.ok(goalLines.includes("Social media marketing: brand awareness") && goalLines.includes("Google Ads: leads"));

// a service with no goal-shaped question in the schema (none currently lack one, but the lookup must not throw if it ever did)
assert.doesNotThrow(() => briefBlocks(["meta"], { name: "A", email: "a@b.co", company: "C" }));

// title: company first, falls back to name, always dated
assert.equal(briefTitle({ company: "Brand Co", name: "Asha" }, new Date("2026-11-24T10:00:00Z")), "Brand Co — 2026-11-24");
assert.equal(briefTitle({ name: "Asha" }, new Date("2026-11-24T10:00:00Z")), "Asha — 2026-11-24");
assert.equal(briefTitle({}, new Date("2026-11-24T10:00:00Z")), "New client — 2026-11-24");
console.log("notionBrief ok");
