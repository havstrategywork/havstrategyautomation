import assert from "node:assert";
import { createServer } from "node:http";
import { addDays, buildReport, days, METRICS, normalizeContent, parseRange, parseSeries, periodValue, pctChange, prevRange, reportRows, toCsv, toDist, topBy } from "./igreport.ts";

// ---- dates ----
assert.equal(addDays("2026-03-01", -1), "2026-02-28");
assert.equal(days({ from: "2026-11-01", to: "2026-11-30" }), 30);
assert.deepEqual(prevRange({ from: "2026-11-01", to: "2026-11-30" }), { from: "2026-10-02", to: "2026-10-31" });
assert.deepEqual(parseRange({ range: "7" }, "2026-11-23").range, { from: "2026-11-17", to: "2026-11-23" });
assert.deepEqual(parseRange({}, "2026-11-23").range, { from: "2026-10-25", to: "2026-11-23" }); // default 30 days
assert.deepEqual(parseRange({ from: "2026-11-01", to: "2026-11-10" }, "2026-11-23"), { range: { from: "2026-11-01", to: "2026-11-10" }, preset: "custom" });
assert.equal(parseRange({ from: "2026-11-01", to: "2027-01-01" }, "2026-11-23").range.to, "2026-11-23"); // no future
assert.equal(parseRange({ from: "2026-11-20", to: "2026-11-10" }, "2026-11-23").range.from, "2026-11-10"); // reversed -> one day
assert.equal(days(parseRange({ from: "2020-01-01", to: "2026-11-10" }, "2026-11-23").range), 366); // capped
assert.equal(parseRange({ from: "nonsense", to: "2026-11-10" }, "2026-11-23").preset, "30");

// ---- series ----
const resp = { data: [{ metric: "reach", values: [{ dateTime: "2026-11-02T00:00:00+01:00", value: 30 }, { dateTime: "2026-11-01T00:00:00+01:00", value: 10 }, { dateTime: "bad", value: 5 }] }] };
const pts = parseSeries(resp);
assert.deepEqual(pts, [{ t: "2026-11-01", v: 10 }, { t: "2026-11-02", v: 30 }]); // sorted, junk dropped
assert.deepEqual(parseSeries({}), []);
const r = { from: "2026-11-01", to: "2026-11-02" };
assert.equal(periodValue(pts, r, "sum"), 40);
assert.equal(periodValue(pts, r, "avg"), 20);
assert.equal(periodValue(pts, r, "last"), 30);
assert.equal(periodValue(pts, { from: "2026-12-01", to: "2026-12-02" }, "sum"), null); // nothing there is not zero
assert.equal(pctChange(150, 100), 50);
assert.equal(pctChange(50, 100), -50);
assert.equal(pctChange(5, 0), null);
assert.equal(pctChange(null, 5), null);

// ---- content + audience ----
const post = normalizeContent("post", { postId: "p1", url: "https://ig/p1", imageUrl: "i.jpg", content: "hi", publishedAt: { dateTime: "2026-11-05T10:00:00" }, likes: 5, comments: 2, reach: 100, impressions: 7, impressionsTotal: 120, engagement: 3.5, saved: 1 });
assert.equal(post.stats.impressions, 120); assert.equal(post.at, "2026-11-05T10:00:00"); assert.equal(post.stats.likes, 5);
const story = normalizeContent("story", { postId: "s1", permalink: "https://ig/s1", thumbnailUrl: "t.jpg", reach: 50, replies: 3, exits: 9, impressions: 60 });
assert.equal(story.url, "https://ig/s1"); assert.equal(story.img, "t.jpg"); assert.equal(story.stats.replies, 3);
assert.deepEqual(topBy([post, { ...post, id: "p2", stats: { reach: 500 } }], "reach", 1).map((c) => c.id), ["p2"]);
assert.deepEqual(toDist({ "18-24": 10, "25-34": 30, junk: "x", zero: 0 }), [{ key: "25-34", value: 30 }, { key: "18-24", value: 10 }]);
assert.deepEqual(toDist({ data: [{ key: "IN", value: 5 }] }), [{ key: "IN", value: 5 }]);
assert.deepEqual(toDist(null), []);

// ---- csv: formulas are defanged, quotes escaped, negatives stay numbers ----
assert.equal(toCsv([["@a", "s", "=SUM(1)", "", "m, x", -5]]).split("\r\n")[1], `@a,s,'=SUM(1),,"m, x",-5`.replace("@a", "'@a"));

// ---- the whole flow against a stand-in Metricool that answers in the documented shapes ----
const seen: string[] = [];
const srv = createServer((req, res) => {
  const u = new URL(req.url!, "http://x"), q = u.searchParams;
  seen.push(`${u.pathname}?${[...q].filter(([k]) => k !== "userId").map(([k, v]) => `${k}=${v}`).join("&")}`);
  if (req.headers["x-mc-auth"] !== "tok" || q.get("userId") !== "5" || q.get("blogId") !== "42") { res.writeHead(401).end(); return; }
  const send = (o: unknown) => res.setHeader("content-type", "application/json").end(JSON.stringify(o));
  if (u.pathname === "/api/v2/analytics/timelines") {
    if (q.get("metric") === "followers") { res.writeHead(500).end(); return; } // one failing metric must not break the rest
    const out = []; for (let d = q.get("from")!.slice(0, 10); d <= q.get("to")!.slice(0, 10); d = addDays(d, 1)) out.push({ dateTime: `${d}T00:00:00`, value: d >= "2026-11-11" ? 20 : 10 });
    return send({ data: [{ metric: q.get("metric"), values: out }] });
  }
  if (u.pathname.endsWith("/posts/instagram")) return send({ data: [{ postId: "a", url: "u1", reach: 10, engagement: 1 }, { postId: "b", url: "u2", reach: 90, engagement: 9 }] });
  if (u.pathname.endsWith("/reels/instagram")) return send({ data: [{ reelId: "r", url: "u3", views: 5 }] });
  if (u.pathname.endsWith("/stories/instagram")) return send({ data: [] });
  if (u.pathname === "/api/stats/gender/instagram") return send({ F: 70, M: 30 });
  if (u.pathname === "/api/stats/age/instagram") return send({ "18-24": 1 });
  res.writeHead(404).end();
});
await new Promise<void>((ok) => srv.listen(0, ok));
process.env.METRICOOL_BASE = `http://127.0.0.1:${(srv.address() as { port: number }).port}/api`;

const range = { from: "2026-11-11", to: "2026-11-20" };
const rep = await buildReport({ userId: "5", token: "tok" }, 42, range);
const m = (k: string) => METRICS.find((x) => x.key === k)!;
const s = rep.series.p_impr; assert.ok(s.ok);
assert.equal(periodValue(s.data, rep.range, m("p_impr").kind), 200); // 10 days x 20
assert.equal(periodValue(s.data, rep.prev, m("p_impr").kind), 100); // previous 10 days x 10
assert.equal(pctChange(200, 100), 100);
assert.ok(!rep.series.followers.ok && /answered 500/.test((rep.series.followers as { error: string }).error)); // isolated failure
assert.ok(rep.series.net.ok && rep.series.r_views.ok);
assert.ok(rep.content.posts.ok && topBy(rep.content.posts.data, "reach", 1)[0].id === "b");
assert.ok(rep.content.stories.ok && rep.content.stories.data.length === 0);
assert.ok(rep.audience.gender.ok && rep.audience.gender.data[0].key === "F");
assert.ok(!rep.audience.country.ok); // 404 shows as a section error, not a crash
assert.ok(seen.some((x) => x.includes("subject=posts&metric=impressions")) && seen.some((x) => x.includes("from=2026-11-01T00:00:00&to=2026-11-20T23:59:59"))); // previous+current window in one call
const csv = toCsv(reportRows("acme", rep));
assert.ok(csv.includes("acme,summary,Posts,,Impressions (total),200") && csv.includes("acme,audience,gender,,F,70") && csv.includes("acme,daily,Posts,2026-11-11,Impressions,20"));

// a wrong token turns every section into a readable error
const bad = await buildReport({ userId: "5", token: "nope" }, 42, range);
assert.ok(!bad.series.p_impr.ok && /refused/.test((bad.series.p_impr as { error: string }).error));
srv.close();
console.log("igreport ok");
