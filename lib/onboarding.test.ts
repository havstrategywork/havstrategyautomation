import assert from "node:assert/strict";
import { allFields, HEADER, stepErrors, STEPS, toRow, validate, visibleSteps } from "./onboarding.ts";

const base = { name: "Asha", email: "asha@brand.com", company: "Brand Co" };
const ids = (s: string[]) => visibleSteps(s as never).map((x) => x.id);

// every old-form question is kept: 57 questions from the Google Form + the new contact/creator/google/meta/seo ones, no duplicate ids
const all = allFields();
assert.equal(new Set(all.map((x) => x.id)).size, all.length);
assert.equal(HEADER.length, all.length + 2);
assert.equal(STEPS[0].kind, "services");

// steps follow the selection
assert.ok(ids(["seo"]).includes("seo") && !ids(["seo"]).includes("google") && !ids(["seo"]).includes("budget") && !ids(["seo"]).includes("socialgoals"));
assert.ok(ids(["social"]).filter((x) => x.startsWith("social")).length === 3);
assert.ok(ids(["meta"]).includes("budget") && ids(["creator"]).includes("budget") && !ids(["social"]).includes("budget"));
assert.ok(ids(["social", "creator", "google", "meta", "seo"]).length === STEPS.length);

// validation
assert.equal(validate({ services: [], answers: base }).ok, false); // at least one service
assert.equal(validate({ services: ["nope"], answers: base }).ok, false);
assert.equal(validate({ services: ["seo"], answers: { ...base, email: "bad" } }).ok, false);
assert.equal(validate({ services: ["seo"], answers: { name: "x", email: "a@b.co" } }).ok, false); // company required
const ok = validate({ services: ["seo", "seo"], answers: { ...base, gKeywords: "should be dropped", sKeywords: "pizza" } });
assert.ok(ok.ok && ok.services.length === 1 && ok.answers.sKeywords === "pizza" && !("gKeywords" in ok.answers));
assert.equal(validate({ services: ["seo"], answers: { ...base, commsScale: "11" } }).ok, false);
assert.equal(validate({ services: ["seo"], answers: { ...base, commsScale: "7" } }).ok, true);
assert.equal(validate({ services: ["seo"], answers: { ...base, logos: "x.png — https://evil.com/a.png" } }).ok, false); // files only from our uploader
assert.equal(validate({ services: ["seo"], answers: { ...base, logos: "logo.png — https://abc123.ufs.sh/f/xyz" } }).ok, true);
assert.equal(validate({ services: ["seo"], answers: { ...base, where: "x".repeat(5001) } }).ok, false);
assert.deepEqual(stepErrors(STEPS[1], base), {});

// the row lines up with the header
const row = toRow(new Date("2026-11-24T10:30:00Z"), ["seo", "meta"], { ...base, sKeywords: "pizza" });
assert.equal(row.length, HEADER.length);
assert.equal(row[0], "2026-11-24 10:30");
assert.equal(row[1], "SEO, Meta Ads"); // in the order the client chose them
assert.equal(row[HEADER.indexOf("Which keywords, topics or pages do you most want to rank for?")], "pizza");
console.log("onboarding ok");
import { sheetIdFromUrl } from "./onboarding.ts";
const sid = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
assert.equal(sheetIdFromUrl(`https://docs.google.com/spreadsheets/d/${sid}/edit?gid=0#gid=0`), sid);
assert.equal(sheetIdFromUrl(`  https://docs.google.com/spreadsheets/d/${sid}  `), sid);
assert.equal(sheetIdFromUrl(sid), sid);
assert.equal(sheetIdFromUrl(`https://docs.google.com/forms/d/${sid}/edit`), null); // a Form is not a sheet
assert.equal(sheetIdFromUrl(`https://evil.com/spreadsheets/d/${sid}`), null);
assert.equal(sheetIdFromUrl("hello"), null);
console.log("sheet link ok");
const site = validate({ services: ["seo"], answers: { ...base, website: "mysite.com" } });
assert.ok(site.ok && site.answers.website === "https://mysite.com"); // no https:// needed
assert.ok(validate({ services: ["seo"], answers: { ...base, website: "http://a.co/x?y=1" } }).ok);
assert.equal(validate({ services: ["seo"], answers: { ...base, website: "not a site" } }).ok, false);
console.log("website ok");
