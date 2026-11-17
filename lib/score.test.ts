import assert from "node:assert";
import { score, scoreParts } from "./score.ts";

const cl = { name: "x", niches: ["fitness"], minFollowers: 10000, maxFollowers: 100000, notes: "", weights: { niche: 1, followers: 1, engagement: 1, collab: 1 } };
const base = { name: "a", niches: ["fitness"], followers: 50000, engagementRate: 6, collab: { count: 2, rating: 5, notes: "" }, notes: "", source: "t", createdAt: new Date() };

assert.equal(score(base, cl), 100);
assert.ok(score({ ...base, niches: ["food"] }, cl) < 80); // niche miss
assert.ok(score({ ...base, followers: 1000 }, cl) < score(base, cl)); // too small
assert.ok(score({ ...base, followers: 5_000_000 }, cl) < score(base, cl)); // too big

// vague / incomplete data
const noTag = { ...base, niches: [], notes: "Gym fitness reels" };
assert.equal(scoreParts(noTag, cl).niche, 0.7); // bio mention beats nothing, loses to an exact tag
assert.equal(scoreParts({ ...base, niches: ["food"], notes: "does squats and gym" }, { ...cl, niches: ["fitness"], related: ["gym"] }).niche, 0.6); // adjacent term
assert.equal(scoreParts({ ...base, followers: 0, engagementRate: undefined }, cl).followers, 0.5); // unknown = neutral
assert.equal(scoreParts({ ...base, engagementRate: undefined }, cl).engagement, 0.5);

// location: only counts when the client states one
const loc = { ...cl, locations: ["dubai"] };
assert.equal(scoreParts(base, cl).location, null);
assert.equal(scoreParts({ ...base, location: "Dubai, UAE" }, loc).location, 1);
assert.equal(scoreParts({ ...base, location: "Mumbai" }, loc).location, 0);
assert.equal(scoreParts(base, loc).location, 0.5); // unknown location
assert.ok(score({ ...base, location: "Dubai, UAE" }, loc) > score({ ...base, location: "Mumbai" }, loc));
console.log("score ok");
