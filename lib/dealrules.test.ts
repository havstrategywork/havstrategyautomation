// Pure rules of the client-review step: reading the returned sheet, the email subject line, the test-mode guard.
import assert from "node:assert";
import { emailAllowed, handleKey, parseRows, parseUpload, splitSubject } from "./dealrules.ts";

const head = "id,Handle,Profile,Followers,Tier,Eng. %,Location,Agreed rate,About,Decision (Yes/No),Note";
const row = (id: string, decision: string, note = "") => `${id},@a${id},https://www.instagram.com/a${id}/,1000,Micro,,,10k INR,,${decision},${note}`;
assert.deepEqual(parseUpload([head, row("1", "Yes", " great fit "), row("2", " no "), row("3", ""), row("4", "maybe")].join("\n")).map((a) => [a.id, a.decision, a.note]), [
  ["1", "yes", "great fit"], ["2", "no", ""], ["3", undefined, ""], ["4", undefined, ""], // blank / "maybe" = not answered yet
]);
// hidden id column is left out of the export: rows are matched by handle instead
const noId = parseUpload("Handle,Profile,Decision (Yes/No),Note\n@Foo,,Yes,ok\n,https://www.instagram.com/bar/?x=1,No,");
assert.deepEqual(noId.map((a) => [a.id, a.handle, a.decision]), [[undefined, "foo", "yes"], [undefined, "bar", "no"]]);
// a title row above the header, BOM, semicolons (Excel in some locales), quoted note with a comma
const odd = parseUpload('﻿Creators to approve;;;\nid;Handle;Decision (Yes/No);Note\n9;@z;Yes;"great, fits"\n');
assert.deepEqual(odd.map((a) => [a.id, a.handle, a.decision, a.note]), [["9", "z", "yes", "great, fits"]]);
assert.throws(() => parseUpload("a,b\n1,2"), /Decision/);
// rows straight from an .xlsx tab (see xlsx.ts): same rules, cells already split
assert.deepEqual(parseRows([["Our creators"], ["id", "Handle", "Decision (Yes/No)", "Note"], ["5", "@q", "yes", "ok"], ["6", "@r", "", ""]]).map((a) => [a.id, a.handle, a.decision]), [["5", "q", "yes"], ["6", "r", undefined]]);
assert.equal(handleKey("https://instagram.com/Foo_Bar/"), "foo_bar");
assert.equal(handleKey(" @Foo "), "foo");

assert.deepEqual(splitSubject("Subject: Hi there\n\nBody"), { subject: "Hi there", body: "Body" });
assert.equal(splitSubject("No subject line").body, "No subject line");

assert.equal(emailAllowed("a@x.com", ""), true); // live
assert.equal(emailAllowed("a@x.com", "none"), false); // test mode, nobody
assert.equal(emailAllowed("A@x.com", "me@y.com, a@x.com"), true);
assert.equal(emailAllowed("b@x.com", "a@x.com"), false);
console.log("dealrules ok");

// days remaining to the content deadline (IST)
{
  const { daysLeft, daysLabel } = await import("./dealrules.ts");
  const now = new Date("2026-11-19T10:00:00Z"); // 15:30 IST, 19 Nov
  assert.equal(daysLeft("2026-11-24", now), 5);
  assert.equal(daysLeft("2026-11-19", now), 0);
  assert.equal(daysLeft("2026-11-17", now), -2);
  assert.equal(daysLeft("2026-11-20", new Date("2026-11-19T19:00:00Z")), 0, "after IST midnight it's already the 20th");
  assert.equal(daysLeft("", now), null);
  assert.equal(daysLeft("tomorrow", now), null);
  assert.equal(daysLabel(5), "5 days left");
  assert.equal(daysLabel(1), "1 day left");
  assert.equal(daysLabel(0), "due today");
  assert.equal(daysLabel(-2), "2 days overdue");
}
