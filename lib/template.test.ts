import assert from "node:assert";
import { firstName, render } from "./template.ts";

const t = "Hi {{name}},\nLove your content ({{ handle }}).\nBudget: 2,000 AED & {braces} stay.";
assert.equal(render(t, { name: "Sara", handle: "@sara" }), "Hi Sara,\nLove your content (@sara).\nBudget: 2,000 AED & {braces} stay.");
assert.equal(render("No slot here.", { name: "X" }), "No slot here."); // no placeholder = sent as is
assert.throws(() => render("Hi {{nmae}}", { name: "X" }), /unfilled/); // typo is caught, never sent
assert.equal(firstName("Sara Khan"), "Sara");
assert.equal(firstName("curlyfragrance"), "curlyfragrance");
console.log("template ok");
