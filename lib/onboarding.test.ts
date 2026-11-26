import assert from "node:assert/strict";
import { allFields, asked, DEFAULT_STEPS as STEPS, questionsOf, sheetRows, stepErrors, validate as check, validateForm, visibleSteps, type Step } from "./onboarding.ts";
const validate = (body: unknown) => check(body, STEPS);

const base = { name: "Asha", email: "asha@brand.com", company: "Brand Co" };
const ids = (s: string[]) => visibleSteps(STEPS, s as never).map((x) => x.id);

// every old-form question is kept: 57 questions from the Google Form + the new contact/creator/google/meta/seo ones, no duplicate ids
const all = allFields(STEPS);
assert.equal(new Set(all.map((x) => x.id)).size, all.length);
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

// the export: one column per question, lined up
const sub = { at: new Date("2026-11-24T10:30:00Z"), services: ["seo", "meta"], answers: { ...base, sKeywords: "pizza" } };
const [header, row] = sheetRows([sub], STEPS);
assert.equal(header.length, all.length + 2);
assert.equal(row.length, header.length);
assert.equal(row[0], "2026-11-24 10:30");
assert.equal(row[1], "SEO, Meta Ads"); // in the order the client chose them
assert.equal(row[header.indexOf("Which keywords, topics or pages do you most want to rank for?")], "pizza");

// editing the form
const copy = () => structuredClone(STEPS) as Step[];
assert.deepEqual(validateForm(copy()), { ok: true, steps: STEPS }); // the built-in form is itself valid
const edited = copy();
edited[1].fields.push({ id: "q_new", label: "  What is your launch date?  ", type: "text", required: true, junk: 1 } as never);
const seo = edited.find((s) => s.id === "seo")!;
seo.fields = seo.fields.filter((f) => f.id !== "sKeywords"); // remove a question
const saved = validateForm(edited);
assert.ok(saved.ok && saved.steps[1].fields.at(-1)!.label === "What is your launch date?" && !("junk" in saved.steps[1].fields.at(-1)!));
assert.equal(check({ services: ["seo"], answers: base }, saved.ok ? saved.steps : []).ok, false); // the new required question is enforced
const answered = check({ services: ["seo"], answers: { ...base, q_new: "May", sKeywords: "x" } }, saved.ok ? saved.steps : []);
assert.ok(answered.ok && answered.answers.q_new === "May" && !("sKeywords" in answered.answers));
// answers to a removed question stay readable and exportable
const after = saved.ok ? saved.steps : [];
const removedHeader = sheetRows([sub], after)[0];
assert.ok(removedHeader.includes("Which keywords, topics or pages do you most want to rank for? (removed question)"));
assert.ok(questionsOf(sub, after).some((q) => q.id === "sKeywords" && q.section === "SEO"));
const snap = { ...sub, questions: asked(STEPS, ["seo"]) };
assert.equal(questionsOf(snap, []).find((q) => q.id === "sKeywords")!.label, "Which keywords, topics or pages do you most want to rank for?");

const rejected = (change: (f: Step[]) => unknown, why: RegExp) => { const f = copy(); const r = validateForm(change(f) ?? f); assert.ok(!r.ok && why.test(r.error), `${why}: ${r.ok ? "accepted" : r.error}`); };
rejected((f) => { f[1].fields = f[1].fields.filter((x) => x.id !== "email"); }, /can't be removed/);
rejected((f) => { f[1].fields[0].required = false; }, /must stay a required/);
rejected((f) => { f[1].services = ["seo"]; }, /every client sees/);
rejected((f) => { f[2].fields = []; }, /add a question/);
rejected((f) => { f[2].fields[0].label = " "; }, /needs a question text/);
rejected((f) => { f[2].fields[0].id = "email"; }, /duplicated/);
rejected((f) => { f[2].fields[0].id = "constructor"; }, /invalid id/);
rejected((f) => { f[2].fields[0].type = "html" as never; }, /unknown answer type/);
rejected((f) => f.slice(1), /service picker/);
rejected(() => [], /empty/);
console.log("onboarding ok");
const site = validate({ services: ["seo"], answers: { ...base, website: "mysite.com" } });
assert.ok(site.ok && site.answers.website === "https://mysite.com"); // no https:// needed
assert.ok(validate({ services: ["seo"], answers: { ...base, website: "http://a.co/x?y=1" } }).ok);
assert.equal(validate({ services: ["seo"], answers: { ...base, website: "not a site" } }).ok, false);
console.log("website ok");
