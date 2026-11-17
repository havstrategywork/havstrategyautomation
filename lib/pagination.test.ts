import assert from "node:assert/strict";
import { getPageNumbers, makePageUrl } from "./pagination.ts";

// 1. URL generation
assert.equal(makePageUrl("/creators", {}, 1), "/creators");
assert.equal(makePageUrl("/creators", {}, 2), "/creators?page=2");
assert.equal(
  makePageUrl("/creators", { status: "New", q: "fitness" }, 3),
  "/creators?status=New&q=fitness&page=3"
);
assert.equal(
  makePageUrl("/creators", { status: "New", page: "5" }, 1),
  "/creators?status=New"
);
assert.equal(
  makePageUrl("/creators", { status: "New", page: "5" }, 2),
  "/creators?status=New&page=2"
);
assert.equal(
  makePageUrl("/outreach", { status: "sent" }, 1),
  "/outreach?status=sent"
);

// 2. getPageNumbers
// Small totals (<= 7)
assert.deepEqual(getPageNumbers(1, 1), [1]);
assert.deepEqual(getPageNumbers(1, 5), [1, 2, 3, 4, 5]);
assert.deepEqual(getPageNumbers(3, 7), [1, 2, 3, 4, 5, 6, 7]);

// Near start (<= 4)
assert.deepEqual(getPageNumbers(1, 10), [1, 2, 3, 4, 5, "...", 10]);
assert.deepEqual(getPageNumbers(4, 10), [1, 2, 3, 4, 5, "...", 10]);

// Near end (>= total - 3)
assert.deepEqual(getPageNumbers(8, 10), [1, "...", 6, 7, 8, 9, 10]);
assert.deepEqual(getPageNumbers(10, 10), [1, "...", 6, 7, 8, 9, 10]);

// Middle
assert.deepEqual(getPageNumbers(5, 10), [1, "...", 4, 5, 6, "...", 10]);
assert.deepEqual(getPageNumbers(6, 12), [1, "...", 5, 6, 7, "...", 12]);

console.log("pagination ok");
