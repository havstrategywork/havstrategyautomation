import assert from "node:assert";
import { createServer } from "node:http";
import type { DailyLike } from "./igreport.ts";
import { addDays, buildReport, combineWindows, days, followerSeries, getTotals, label, normalizeMedia, normalizeStory, parseBreakdown, parseRange, parseTotals, pctChange, prevRange, reportRows, seriesFrom, toCsv, topBy, TOTALS, unix, windows } from "./igreport.ts";

// ---- dates ----
assert.equal(addDays("2026-03-01", -1), "2026-02-28");
assert.equal(days({ from: "2026-11-01", to: "2026-11-30" }), 30);
assert.deepEqual(prevRange({ from: "2026-11-01", to: "2026-11-30" }), { from: "2026-10-02", to: "2026-10-31" });
assert.equal(unix("1970-01-02"), 86400);
assert.equal(unix("1970-01-02", true), 172799); // the last second of that day
assert.deepEqual(windows({ from: "2026-11-01", to: "2026-11-10" }), [{ from: "2026-11-01", to: "2026-11-10" }]);
assert.deepEqual(windows({ from: "2026-10-01", to: "2026-11-15" }).map((w) => days(w)), [30, 16]); // 46 days = 30 + 16
assert.deepEqual(parseRange({ range: "7" }, "2026-11-23").range, { from: "2026-11-17", to: "2026-11-23" });
assert.deepEqual(parseRange({}, "2026-11-23").range, { from: "2026-10-25", to: "2026-11-23" });
assert.equal(parseRange({ from: "2026-11-01", to: "2027-01-01" }, "2026-11-23").range.to, "2026-11-23"); // no future
assert.equal(parseRange({ from: "2026-11-20", to: "2026-11-10" }, "2026-11-23").range.from, "2026-11-10");
assert.equal(days(parseRange({ from: "2020-01-01", to: "2026-11-10" }, "2026-11-23").range), 90); // capped at what Meta keeps
assert.equal(parseRange({ from: "nonsense", to: "2026-11-10" }, "2026-11-23").preset, "30");

// ---- parsing, in the shapes Meta documents ----
assert.deepEqual(parseTotals({ data: [{ name: "reach", period: "day", total_value: { value: 224 } }, { name: "views", total_value: { value: 0 } }, { name: "likes" }, { name: "saves", values: [{ value: 7 }] }] }), { reach: 224, views: 0, saves: 7 }); // no value = absent, not 0
assert.deepEqual(parseTotals(null), {});
const bd = parseBreakdown({ data: [
  { name: "reach", total_value: { value: 224, breakdowns: [{ dimension_keys: ["media_product_type"], results: [{ dimension_values: ["CAROUSEL_CONTAINER"], value: 100 }, { dimension_values: ["POST"], value: 124 }] }] } },
  { name: "follower_demographics", total_value: { breakdowns: [{ dimension_keys: ["timeframe", "country"], results: [{ dimension_values: ["THIS_MONTH", "IN"], value: 7 }, { dimension_values: ["THIS_MONTH", "US"], value: 3 }, { dimension_values: ["THIS_MONTH", "IN"], value: 2 }, { dimension_values: ["THIS_MONTH", "XX"], value: 0 }] }] } },
] });
assert.deepEqual(bd.reach, [{ key: "POST", value: 124 }, { key: "CAROUSEL_CONTAINER", value: 100 }]);
assert.deepEqual(bd.follower_demographics, [{ key: "IN", value: 9 }, { key: "US", value: 3 }]); // last dimension is the key, duplicates add, zeros drop
assert.equal(label("country", "IN"), "India"); assert.equal(label("gender", "F"), "Female"); assert.equal(label("format", "REELS"), "Reels"); assert.equal(label("country", "Narnia"), "Narnia");

const post = normalizeMedia({ id: "p1", permalink: "https://ig/p1", media_url: "m.jpg", caption: "hi", timestamp: "2026-11-05T10:00:00+0000", media_product_type: "FEED", like_count: 5, comments_count: 2, insights: { data: [{ name: "reach", values: [{ value: 100 }] }, { name: "views", values: [{ value: 150 }] }, { name: "total_interactions", values: [{ value: 9 }] }] } });
assert.deepEqual([post.kind, post.stats.likes, post.stats.reach, post.stats.views, post.stats.interactions, post.img], ["post", 5, 100, 150, 9, "m.jpg"]);
const reel = normalizeMedia({ id: "r1", media_product_type: "REELS", thumbnail_url: "t.jpg", media_url: "m.mp4" });
assert.equal(reel.kind, "reel"); assert.equal(reel.img, "t.jpg"); assert.deepEqual(reel.stats, {}); // thumbnail wins over the video file; no insights = no stats
const story = normalizeStory({ id: "s1", permalink: "https://ig/s1", thumbnail_url: "t.jpg", insights: { data: [{ name: "replies", total_value: { value: 3 } }, { name: "reach", total_value: { value: 50 } }] } });
assert.deepEqual([story.kind, story.stats.replies, story.stats.reach], ["story", 3, 50]);
assert.deepEqual(topBy([post, { ...post, id: "p2", stats: { reach: 500 } }], "reach", 1).map((c) => c.id), ["p2"]);

// ---- period maths ----
assert.equal(pctChange(150, 100), 50); assert.equal(pctChange(50, 100), -50); assert.equal(pctChange(5, 0), null); assert.equal(pctChange(undefined, 5), null);
const c2 = combineWindows([{ reach: 100, views: 10 }, { reach: 300, views: 30 }]);
assert.deepEqual(c2.values, { reach: 200, views: 40 }); // reach is distinct accounts: averaged, views added
assert.equal(c2.windows, 2);
assert.deepEqual(combineWindows([{ views: 5 }]).values, { views: 5 }); // a metric missing everywhere stays missing

// ---- daily rows ----
const rows: DailyLike[] = [{ date: "2026-11-02", m: { reach: 20 }, followers: 102 }, { date: "2026-11-01", m: { reach: 10 }, followers: 100 }, { date: "2026-10-01", m: { reach: 99 } }, { date: "2026-11-03", m: {} }];
const rg = { from: "2026-11-01", to: "2026-11-30" };
assert.deepEqual(seriesFrom(rows, "reach", rg), [{ t: "2026-11-01", v: 10 }, { t: "2026-11-02", v: 20 }]); // sorted, in range, empty rows skipped
assert.deepEqual(followerSeries(rows, rg), [{ t: "2026-11-01", v: 100 }, { t: "2026-11-02", v: 102 }]);

// ---- csv ----
assert.equal(toCsv([["a", "s", "=SUM(1)", "", "m, x", -5]]).split("\r\n")[1], `a,s,'=SUM(1),,"m, x",-5`);

// ---- the whole flow against a stand-in Graph API that answers in the documented shapes ----
const calls: string[] = [];
const srv = createServer((req, res) => {
  const u = new URL(req.url!, "http://x"), q = u.searchParams, path = u.pathname.replace(/^\/v27\.0/, "");
  calls.push(`${path}?${[...q].map(([k, v]) => `${k}=${v}`).join("&")}`);
  const j = (o: unknown, code = 200) => res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(o));
  if (req.headers.authorization !== "Bearer TOK") return j({ error: { message: "Invalid OAuth access token." } }, 401);
  if (path === "/17841") return j({ username: "acme", followers_count: 1234, follows_count: 10, media_count: 55 });
  if (path === "/17841/media") return j({ data: [{ id: "m1", media_product_type: "FEED", permalink: "u1", like_count: 3, insights: { data: [{ name: "reach", values: [{ value: 10 }] }, { name: "total_interactions", values: [{ value: 5 }] }] } }, { id: "m2", media_product_type: "REELS", permalink: "u2", like_count: 9, insights: { data: [{ name: "reach", values: [{ value: 90 }] }, { name: "total_interactions", values: [{ value: 50 }] }] } }] });
  if (path === "/17841/stories") return j({ data: [] });
  if (path === "/17841/insights") {
    const metrics = (q.get("metric") ?? "").split(",");
    if (metrics[0] === "follower_demographics") return q.get("breakdown") === "city" ? j({ error: { message: "city is broken" } }, 500) : j({ data: [{ name: "follower_demographics", total_value: { breakdowns: [{ dimension_keys: ["timeframe", q.get("breakdown")], results: [{ dimension_values: ["THIS_MONTH", q.get("breakdown") === "gender" ? "F" : q.get("breakdown") === "country" ? "IN" : "25-34"], value: 60 }] }] } }] });
    if (q.get("breakdown") === "media_product_type") return j({ data: metrics.map((name) => ({ name, total_value: { value: 100, breakdowns: [{ dimension_keys: ["media_product_type"], results: [{ dimension_values: ["POST"], value: 40 }, { dimension_values: ["REEL"], value: 60 }] }] } })) });
    if (metrics.includes("reposts")) return j({ error: { message: "An unknown error has occurred." } }, 400); // the combined call is rejected, and so is `reposts` alone
    const span = (Number(q.get("until")) - Number(q.get("since")) + 1) / 86400;
    return j({ data: metrics.map((name) => ({ name, period: "day", total_value: { value: span * 10 } })) });
  }
  j({ error: { message: "not found" } }, 404);
});
await new Promise<void>((ok) => srv.listen(0, ok));
process.env.META_GRAPH_BASE = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;

// one unsupported metric must not hide the others: the combined call fails, the fallback gets every metric but that one
const one = await getTotals("TOK", "17841", { from: "2026-11-01", to: "2026-11-01" });
assert.equal(one.views, 10); assert.equal(one.reposts, undefined); assert.equal(Object.keys(one).length, TOTALS.length - 1);
// a systemic error (bad token) stops after the first failed fallback call instead of repeating it 11 times
calls.length = 0;
await assert.rejects(() => getTotals("WRONG", "17841", { from: "2026-11-01", to: "2026-11-01" }), /Invalid OAuth/);
assert.equal(calls.length, 2); // the combined call, then one fallback call that failed the same way: it stops there

// a full report over 45 days: sections fill in, long ranges are split into 30-day windows, and one failing section shows its own error
calls.length = 0;
const range = { from: "2026-10-10", to: "2026-11-23" }; // 45 days
const rep = await buildReport("TOK", "17841", range);
assert.ok(rep.account.ok && rep.account.data.followers === 1234 && rep.account.data.username === "acme");
assert.ok(rep.totals.ok);
if (rep.totals.ok) {
  assert.equal(rep.totals.data.windows, 2);
  assert.equal(rep.totals.data.cur.views, 450); // views are added: (30 + 15 days) x 10
  assert.equal(rep.totals.data.cur.reach, (300 + 150) / 2); // reach is distinct accounts: averaged across the two windows
  assert.equal(rep.totals.data.prev.views, 450); // the 45 days before
  assert.equal(rep.totals.data.cur.reposts, undefined);
}
assert.ok(rep.split.ok && rep.split.data.views[0].key === "REEL");
assert.ok(rep.media.ok && rep.media.data.length === 2 && rep.media.data[1].kind === "reel" && rep.media.data[1].stats.views === undefined);
assert.ok(rep.audience.gender.ok && rep.audience.gender.data[0].key === "Female");
assert.ok(rep.audience.country.ok && rep.audience.country.data[0].key === "India");
assert.ok(rep.audience.age.ok && rep.audience.age.data[0].key === "25-34");
assert.ok(!rep.audience.city.ok && /city is broken/.test((rep.audience.city as { error: string }).error)); // isolated failure
assert.ok(calls.some((c) => c.includes("/17841/media?") && c.includes("since=") && c.includes("limit=50")));
assert.ok(calls.some((c) => c.includes("timeframe=this_month") && c.includes("breakdown=gender")));
assert.ok(!calls.some((c) => /access_token/.test(c))); // the token goes in a header, never in a URL

// a wrong token turns the sections into readable errors, not a crash
const bad = await buildReport("WRONG", "17841", range);
assert.ok(!bad.totals.ok && /Invalid OAuth/.test((bad.totals as { error: string }).error) && !bad.account.ok && !bad.media.ok);

// csv rows carry the summary, the stored daily history, format split, content and audience
const csv = toCsv(reportRows("acme", rep, rows, []));
assert.ok(csv.includes("acme,summary,,,Views,450") && csv.includes("acme,summary,,,Accounts reached (average per 30 days),225"));
assert.ok(csv.includes("acme,daily,,2026-11-01,Accounts reached,10") && csv.includes("acme,daily,,2026-11-02,Followers,102"));
assert.ok(csv.includes("acme,by format,Reels,,views,60") && csv.includes("acme,audience,gender,,Female,60") && csv.includes("acme,content reel,u2,,reach,90"));
srv.close();
console.log("igreport ok");
