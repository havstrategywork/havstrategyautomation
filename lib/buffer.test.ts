import assert from "node:assert";
import { createServer } from "node:http";
import { addDays, buildReport, checkNewPost, createPostBody, days, deleteBody, dayIn, gql, istToUtc, listChannels, listPosts, metricMap, monthGrid, moveBody, mutate, normalizePost, parseRange, pctChange, prevRange, reportRows, shiftMonth, timeIn, toCsv, topBy } from "./buffer.ts";

// ---- dates ----
assert.equal(addDays("2026-03-01", -1), "2026-02-28");
assert.deepEqual(prevRange({ from: "2026-11-01", to: "2026-11-30" }), { from: "2026-10-02", to: "2026-10-31" });
assert.deepEqual(parseRange({ range: "7" }, "2026-11-23").range, { from: "2026-11-17", to: "2026-11-23" });
assert.equal(parseRange({ from: "2026-11-01", to: "2027-01-01" }, "2026-11-23").range.to, "2026-11-23"); // no future
assert.equal(days(parseRange({ from: "2020-01-01", to: "2026-11-10" }, "2026-11-23").range), 365); // capped at Buffer's year
assert.equal(parseRange({ from: "nonsense", to: "2026-11-10" }, "2026-11-23").preset, "30");
assert.equal(pctChange(150, 100), 50); assert.equal(pctChange(5, 0), null); assert.equal(pctChange(undefined, 5), null);

// ---- parsing ----
assert.deepEqual(metricMap([{ type: "reach", value: 10 }, { type: "bad", value: "x" }, { type: "views", value: 0 }]), { reach: 10, views: 0 });
const post = normalizePost({ id: "p1", text: "hi", sentAt: "2026-11-05T10:00:00Z", externalLink: "https://ig/p1", assets: [{ thumbnail: "t.jpg" }], metrics: [{ type: "reactions", value: 5 }, { type: "comments", value: 2 }, { type: "saves", value: 3 }, { type: "reach", value: 100 }] });
assert.deepEqual([post.url, post.img, post.at, post.stats.interactions], ["https://ig/p1", "t.jpg", "2026-11-05T10:00:00Z", 10]);
assert.deepEqual(normalizePost({ id: "p2", metrics: null }).stats, {}); // not measured yet: no stats, not zeros
assert.deepEqual(topBy([post, { ...post, id: "p3", stats: { interactions: 99 } }], "interactions", 1).map((c) => c.id), ["p3"]);

// ---- against a local stub of Buffer ----
const calls: { auth: string | undefined; query: string }[] = [];
const srv = createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    const query = (JSON.parse(body || "{}") as { query: string }).query ?? "";
    calls.push({ auth: req.headers.authorization, query });
    const j = (o: unknown, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== "Bearer GOOD") return j({}, 401);
    if (query.startsWith("mutation")) return j({ data: { m: query.includes("FAIL") ? { message: "Invalid post: nope" } : query.includes("deletePost") ? { id: "p9" } : { post: { id: "p9" } } } });
    if (query.includes("account {")) return j({ data: { account: { organizations: [{ id: "org1" }, { id: "org2" }] } } });
    if (query.includes("channels(input")) return j({ data: { channels: query.includes('"org1"') ? [{ id: "c1", name: "acme", service: "instagram", isDisconnected: false }] : [{ id: "c2", name: "acme_fb", service: "facebook", isLocked: true }] } });
    if (query.includes("aggregatedPostMetrics")) {
      if (query.includes('"2026-09-')) return j({ errors: [{ message: "Free-plan Insights are limited to the last 31 days of history." }] }); // the comparison period of the "free plan" range below
      const prev = query.includes('"2026-10-07T');
      return j({ data: { m: { metrics: prev ? [{ type: "postCount", value: 2 }, { type: "reach", value: 500 }] : [{ type: "postCount", value: 4 }, { type: "reach", value: 1000 }, { type: "engagementRate", value: 5.5 }], metricsUpdatedAt: "2026-11-25T00:00:00Z" } } });
    }
    if (query.includes("posts(") && query.includes("status: [draft]")) return j({ data: { posts: { edges: [{ node: { id: "d1", channelId: "c1", status: "draft", text: "draft", dueAt: null, assets: [{ thumbnail: "t.jpg" }], error: null } }], pageInfo: { hasNextPage: false } } } });
    if (query.includes("posts(")) {
      const second = query.includes('after: "c1"');
      return j({ data: { posts: { edges: second ? [{ node: { id: "old", sentAt: "2026-01-01T00:00:00Z", metrics: [] } }] : [{ node: { id: "a", text: "A", sentAt: "2026-11-20T09:00:00Z", metrics: [{ type: "reactions", value: 7 }] } }, { node: { id: "b", sentAt: "2026-11-21T09:00:00Z", metrics: null } }], pageInfo: { endCursor: "c1", hasNextPage: !second } } } });
    }
    j({ errors: [{ message: "unknown query" }] });
  });
});
await new Promise<void>((ok) => srv.listen(0, ok));
process.env.BUFFER_API_BASE = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;

process.env.BUFFER_API_KEY = "";
await assert.rejects(() => gql("{ x }"), /BUFFER_API_KEY is not set/);
process.env.BUFFER_API_KEY = "BAD";
await assert.rejects(() => gql("{ x }"), /rejected the API key/);
process.env.BUFFER_API_KEY = "GOOD";

const ch = await listChannels();
assert.deepEqual(ch.map((c) => [c.id, c.organizationId, c.service, c.locked]), [["c1", "org1", "instagram", false], ["c2", "org2", "facebook", true]]);

const range = { from: "2026-11-01", to: "2026-11-25" };
const rep = await buildReport({ channelId: "c1", organizationId: "org1" }, range, "2026-11-26");
assert.ok(rep.totals.ok && rep.totals.data.cur.reach === 1000 && rep.totals.data.prev.reach === 500 && rep.totals.data.updatedAt === "2026-11-25T00:00:00Z");
assert.ok(rep.posts.ok && rep.posts.data.map((p) => p.id).join() === "a,b"); // second page's January post is outside the range
assert.ok(calls.every((c) => c.auth !== undefined)); // the key travels in a header, never in the query
const aggs = calls.filter((c) => c.query.includes("aggregatedPostMetrics")).map((c) => c.query);
assert.ok(aggs.some((a) => a.includes('"2026-11-01T00:00:00Z"') && a.includes('channelIds: ["c1"]')) && aggs.some((a) => a.includes('"2026-10-07T00:00:00Z"'))); // current + previous 25 days

// the previous period being refused (Free plan keeps 31 days) must not lose the current numbers
const free = await buildReport({ channelId: "c1", organizationId: "org1" }, { from: "2026-10-27", to: "2026-11-25" }, "2026-11-26");
assert.ok(free.totals.ok && free.totals.data.cur.reach === 1000 && free.totals.data.prev.reach === undefined && /31 days/.test(free.totals.data.prevError ?? ""));

// a range whose previous period starts over 2 years back skips the comparison instead of failing
const old = await buildReport({ channelId: "c1", organizationId: "org1" }, { from: "2025-01-01", to: "2025-12-31" }, "2026-11-26");
assert.equal(old.prev, null); assert.ok(old.totals.ok && Object.keys(old.totals.data.prev).length === 0);

// a bad key becomes readable section errors, not a crash
process.env.BUFFER_API_KEY = "BAD";
const bad = await buildReport({ channelId: "c1", organizationId: "org2" }, range, "2026-11-26");
assert.ok(!bad.totals.ok && /rejected the API key/.test((bad.totals as { error: string }).error) && !bad.posts.ok);
process.env.BUFFER_API_KEY = "GOOD";

const csv = toCsv(reportRows("acme", rep));
assert.ok(csv.includes("acme,summary,,,Reach,1000") && csv.includes("acme,summary,,,Reach previous period,500") && csv.includes("acme,post,a,2026-11-20,reactions,7"));
assert.ok(toCsv([["x", "=cmd", "", "", "m", 1]]).includes("'=cmd")); // spreadsheet formulas are neutralised

// ---- planner ----
assert.equal(istToUtc("2026-12-01", "14:30"), "2026-12-01T09:00:00.000Z"); // India time is UTC+5:30
assert.equal(istToUtc("nonsense", "14:30"), null); assert.equal(istToUtc("2026-12-01", "2pm"), null);
assert.equal(dayIn("2026-12-01T20:00:00Z"), "2026-12-02"); // 01:30 the next day in India
assert.equal(timeIn("2026-12-01T09:00:00Z"), "14:30");
assert.equal(shiftMonth("2026-12", 1), "2027-01"); assert.equal(shiftMonth("2026-01", -1), "2025-12");
const g = monthGrid("2026-11"); // 1 Nov 2026 is a Sunday: the grid starts Monday 26 Oct and ends Sunday 6 Dec
assert.deepEqual([g[0], g.at(-1), g.length % 7], ["2026-10-26", "2026-12-06", 0]);
assert.equal(monthGrid("2026-06").length, 35); // June 2026 fits in 5 weeks

const ig = { channelId: "c1", service: "instagram", text: "hi", mode: "schedule" as const, dueAt: "2026-12-01T09:00:00.000Z", mediaUrl: "https://x.test/a.jpg" };
const now = Date.parse("2026-11-26T00:00:00Z");
assert.equal(checkNewPost(ig, now), null);
assert.match(checkNewPost({ ...ig, mediaUrl: undefined }, now)!, /need an image or video/); // Instagram never posts text only
assert.match(checkNewPost({ ...ig, mediaUrl: "http://x.test/a.jpg" }, now)!, /https/);
assert.match(checkNewPost({ ...ig, text: "x".repeat(2197) }, now)!, /2196/);
assert.match(checkNewPost({ ...ig, dueAt: "2026-11-25T00:00:00Z" }, now)!, /future/);
assert.equal(checkNewPost({ ...ig, mode: "queue", dueAt: undefined }, now), null); // the queue needs no time
const body = createPostBody({ ...ig, text: 'say "hi"\nnext', igType: "reel", mediaUrl: "https://x.test/v.mp4" });
assert.ok(body.includes('text: "say \\"hi\\"\\nnext"') && body.includes("customScheduled") && body.includes('video: { url: "https://x.test/v.mp4" }') && body.includes("type: reel") && !body.includes("saveToDraft")); // quotes and newlines are escaped
const dbody = createPostBody({ ...ig, mode: "draft", dueAt: undefined });
assert.ok(dbody.includes("saveToDraft: true") && dbody.includes("addToQueue") && !dbody.includes("dueAt") && dbody.includes('image: { url:'));
assert.ok(!createPostBody({ ...ig, service: "facebook" }).includes("metadata")); // only Instagram gets Instagram metadata
const ut = createPostBody({ ...ig, mediaUrl: "https://app.ufs.sh/f/KEY", mediaKind: "video" }); // UploadThing links have no extension: the uploader's file type decides
assert.ok(ut.includes("video: { url") && !ut.includes("image: {") && createPostBody({ ...ig, mediaUrl: "https://app.ufs.sh/f/KEY" }).includes("image: { url"));
assert.ok(moveBody("p1", "draft").includes("saveToDraft: true") && moveBody("p1", "scheduled", "2026-12-01T09:00:00.000Z").includes("customScheduled"));
assert.ok(deleteBody("p1").includes("deletePost"));

assert.equal(await mutate(createPostBody(ig)), "p9");
assert.equal(await mutate(deleteBody("p9")), "p9");
await assert.rejects(() => mutate(createPostBody({ ...ig, text: "FAIL" })), /Invalid post: nope/); // Buffer's error member becomes a readable message
const drafts = await listPosts("org1", ["c1"], "status: [draft]");
assert.deepEqual(drafts.map((d) => [d.id, d.status, d.img, d.dueAt]), [["d1", "draft", "t.jpg", undefined]]);
assert.deepEqual(await listPosts("org1", [], "status: [draft]"), []); // no channels = no call

// an organization's own key is the one sent, even when the shared key is missing or wrong
process.env.BUFFER_API_KEY = "";
calls.length = 0;
assert.equal(await mutate(createPostBody(ig), "GOOD"), "p9"); // first, because a write empties the cache: the reads below really call Buffer
assert.equal((await listChannels("GOOD")).length, 2);
assert.equal((await listPosts("org1", ["c1"], "status: [draft]", "GOOD")).length, 1);
assert.ok((await buildReport({ channelId: "c1", organizationId: "org1" }, range, "2026-11-26", "GOOD")).totals.ok);
assert.ok(calls.length >= 6 && calls.every((c) => c.auth === "Bearer GOOD"));
await assert.rejects(() => listChannels("BAD"), /rejected the API key/); // cached answers are per key
await assert.rejects(() => listChannels(""), /BUFFER_API_KEY is not set/);

srv.close();
console.log("buffer ok");
