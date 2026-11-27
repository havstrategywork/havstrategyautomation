import assert from "node:assert/strict";
import { isPriority, PRIORITIES, rankOf } from "./priority.ts";

// high sorts before normal before low; unset or unknown is normal
assert.deepEqual(["low", null, "high", "normal", "bogus"].sort((a, b) => rankOf(a) - rankOf(b)), ["high", null, "normal", "bogus", "low"]);
assert.ok(PRIORITIES.every(isPriority) && !isPriority("urgent") && !isPriority(undefined));
console.log("priority ok");
