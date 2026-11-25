import assert from "node:assert/strict";
import { bullet, divider, h2, p, pageIdFromUrl } from "./notion.ts";

const id = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d";
const dashed = "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d";
assert.equal(pageIdFromUrl(`https://www.notion.so/My-Brief-${id}`), id);
assert.equal(pageIdFromUrl(`https://www.notion.so/My-Brief-${dashed}`), id);
assert.equal(pageIdFromUrl(`https://www.notion.so/myworkspace/${id}?v=abc`), id);
assert.equal(pageIdFromUrl(`  ${id}  `), id); // bare id, padded
assert.equal(pageIdFromUrl("https://www.notion.so/My-Database-view-abc123"), null); // too short, not a real id
assert.equal(pageIdFromUrl("hello"), null);

// block shapes are plain, serializable objects (no network): spot-check the ones briefs use
assert.deepEqual(h2("Contact"), { object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: "Contact" } }] } });
assert.deepEqual(p("hi"), { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "hi" } }] } });
assert.deepEqual(bullet("x"), { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: "x" } }] } });
assert.deepEqual(divider(), { object: "block", type: "divider", divider: {} });
console.log("notion ok");
