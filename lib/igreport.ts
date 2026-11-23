// Instagram report for one Metricool brand: daily metric series (current + previous period), top content, audience.
// Every section is fetched independently, so one failing call shows its own error instead of blanking the report.
import { mc, MetricoolError, type Creds } from "./metricool.ts";

export type Range = { from: string; to: string }; // YYYY-MM-DD, both days included
export type Pt = { t: string; v: number };
export type Sec<T> = { ok: true; data: T } | { ok: false; error: string };
export type Dist = { key: string; value: number };
export type Content = { id: string; kind: "post" | "reel" | "story"; url?: string; img?: string; text?: string; at?: string; stats: Record<string, number> };

// kind: how a day-by-day series becomes one number for the period. sum = additive counts; avg = daily average (reach is unique people per day, engagement is a %); last = latest value.
export type Metric = { key: string; label: string; group: "Growth" | "Posts" | "Reels"; subject: "account" | "posts" | "reels"; metric: string; kind: "sum" | "avg" | "last"; unit?: "%" };
export const METRICS: Metric[] = [
  { key: "followers", label: "Followers", group: "Growth", subject: "account", metric: "followers", kind: "last" },
  { key: "gained", label: "Followers gained", group: "Growth", subject: "account", metric: "followers_gained", kind: "sum" },
  { key: "lost", label: "Followers lost", group: "Growth", subject: "account", metric: "followers_lost", kind: "sum" },
  { key: "net", label: "Net followers", group: "Growth", subject: "account", metric: "delta_followers", kind: "sum" },
  { key: "clicks", label: "Profile link clicks", group: "Growth", subject: "account", metric: "clicks_total", kind: "sum" },
  { key: "p_reach", label: "Avg daily reach", group: "Posts", subject: "posts", metric: "reach", kind: "avg" },
  { key: "p_impr", label: "Impressions", group: "Posts", subject: "posts", metric: "impressions", kind: "sum" },
  { key: "p_eng", label: "Engagement", group: "Posts", subject: "posts", metric: "engagement", kind: "avg", unit: "%" },
  { key: "p_inter", label: "Interactions", group: "Posts", subject: "posts", metric: "interactions", kind: "sum" },
  { key: "p_likes", label: "Likes", group: "Posts", subject: "posts", metric: "likes", kind: "sum" },
  { key: "p_comm", label: "Comments", group: "Posts", subject: "posts", metric: "comments", kind: "sum" },
  { key: "p_saves", label: "Saves", group: "Posts", subject: "posts", metric: "saves", kind: "sum" },
  { key: "p_shares", label: "Shares", group: "Posts", subject: "posts", metric: "shares", kind: "sum" },
  { key: "r_views", label: "Video views", group: "Reels", subject: "reels", metric: "videoviews", kind: "sum" },
  { key: "r_reach", label: "Avg daily reach", group: "Reels", subject: "reels", metric: "reach", kind: "avg" },
  { key: "r_impr", label: "Impressions", group: "Reels", subject: "reels", metric: "impressions", kind: "sum" },
  { key: "r_eng", label: "Engagement", group: "Reels", subject: "reels", metric: "engagement", kind: "avg", unit: "%" },
  { key: "r_inter", label: "Interactions", group: "Reels", subject: "reels", metric: "interactions", kind: "sum" },
  { key: "r_likes", label: "Likes", group: "Reels", subject: "reels", metric: "likes", kind: "sum" },
  { key: "r_comm", label: "Comments", group: "Reels", subject: "reels", metric: "comments", kind: "sum" },
  { key: "r_shares", label: "Shares", group: "Reels", subject: "reels", metric: "shares", kind: "sum" },
  { key: "r_saved", label: "Saves", group: "Reels", subject: "reels", metric: "saved", kind: "sum" },
];

// ---- dates (plain YYYY-MM-DD strings; UTC maths so a timezone never shifts a day) ----
const DAY = 864e5, ISO = /^\d{4}-\d{2}-\d{2}$/;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) => new Date(ms(d) + n * DAY).toISOString().slice(0, 10);
export const days = (r: Range) => Math.round((ms(r.to) - ms(r.from)) / DAY) + 1;
export const prevRange = (r: Range): Range => ({ from: addDays(r.from, -days(r)), to: addDays(r.from, -1) });
export const todayIn = (tz = "Asia/Kolkata") => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

/** ?range=7|30|90 or custom ?from=&to=. Anything invalid falls back to the last 30 days; a custom range is capped at 366 days and can't end in the future. */
export function parseRange(sp: { range?: string; from?: string; to?: string }, today: string): { range: Range; preset: string } {
  const n = Number(sp.range);
  if ([7, 30, 90].includes(n)) return { range: { from: addDays(today, -(n - 1)), to: today }, preset: String(n) };
  if (sp.from && sp.to && ISO.test(sp.from) && ISO.test(sp.to) && !Number.isNaN(ms(sp.from)) && !Number.isNaN(ms(sp.to))) {
    const to = sp.to > today ? today : sp.to;
    const from = sp.from > to ? to : sp.from;
    return { range: { from: days({ from, to }) > 366 ? addDays(to, -365) : from, to }, preset: "custom" };
  }
  return { range: { from: addDays(today, -29), to: today }, preset: "30" };
}

// ---- parsing (pure) ----
type Json = Record<string, unknown>;
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : Number(x) || 0);
const arr = (x: unknown): Json[] => (Array.isArray(x) ? (x as Json[]) : []);

/** v2 timelines answer { data: [ { metric, values: [ { dateTime, value } ] } ] }. */
export function parseSeries(resp: unknown): Pt[] {
  const first = arr((resp as Json)?.data)[0];
  return arr(first?.values).map((v) => ({ t: String(v.dateTime).slice(0, 10), v: num(v.value) })).filter((p) => ISO.test(p.t)).sort((a, b) => a.t.localeCompare(b.t));
}

/** One number for the days inside `r`, or null when the series has nothing there. */
export function periodValue(pts: Pt[], r: Range, kind: Metric["kind"]): number | null {
  const inside = pts.filter((p) => p.t >= r.from && p.t <= r.to);
  if (!inside.length) return null;
  if (kind === "last") return inside[inside.length - 1].v;
  const sum = inside.reduce((a, p) => a + p.v, 0);
  return kind === "sum" ? sum : sum / inside.length;
}
export const pctChange = (cur: number | null, prev: number | null) => (cur === null || prev === null || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100);

const when = (x: unknown) => { const d = (x as Json)?.dateTime; return typeof d === "string" ? d : undefined; };
const str = (x: unknown) => (typeof x === "string" && x ? x : undefined);
/** Posts, reels and stories use different field names in Metricool; this maps them to one shape. */
export function normalizeContent(kind: Content["kind"], r: Json): Content {
  const pick = (...k: string[]) => Object.fromEntries(k.flatMap((x) => (r[x] === undefined || r[x] === null ? [] : [[x, num(r[x])]])));
  const stats = kind === "story"
    ? { ...pick("reach", "replies", "exits", "tapsForward", "tapsBack"), impressions: num(r.impressionsTotal ?? r.impressions) }
    : { ...pick("reach", "likes", "comments", "shares", "saved", "interactions", "engagement", "views"), impressions: num(r.impressionsTotal ?? r.impressions) };
  return { id: String(r.reelId ?? r.postId ?? r.contentId ?? r.url ?? Math.random()), kind, url: str(r.url) ?? str(r.permalink), img: str(r.imageUrl) ?? str(r.thumbnailUrl) ?? str(r.mediaUrl), text: str(r.content), at: when(r.publishedAt), stats };
}
export const topBy = (items: Content[], key: string, n = 6) => [...items].sort((a, b) => (b.stats[key] ?? 0) - (a.stats[key] ?? 0)).slice(0, n);

/** Demographics come back as a { label: number } map (or a list of { key, value }); returns them biggest first. */
export function toDist(raw: unknown): Dist[] {
  const d = (raw as Json)?.data ?? raw;
  const rows: Dist[] = Array.isArray(d) ? arr(d).map((x) => ({ key: String(x.key ?? x.label ?? x.name ?? ""), value: num(x.value) })) : d && typeof d === "object" ? Object.entries(d as Json).filter(([, v]) => typeof v === "number" || (typeof v === "string" && v !== "" && !Number.isNaN(Number(v)))).map(([key, v]) => ({ key, value: num(v) })) : [];
  return rows.filter((x) => x.key && x.value > 0).sort((a, b) => b.value - a.value);
}

// ---- fetching ----
const TTL = 5 * 60e3;
const sec = async <T,>(f: () => Promise<T>): Promise<Sec<T>> => {
  try { return { ok: true, data: await f() }; }
  catch (e) { return { ok: false, error: e instanceof MetricoolError ? e.message : "Unexpected answer from Metricool." }; }
};

export type Report = {
  range: Range; prev: Range;
  series: Record<string, Sec<Pt[]>>; // covers the previous period + the current one
  content: { posts: Sec<Content[]>; reels: Sec<Content[]>; stories: Sec<Content[]> };
  audience: { gender: Sec<Dist[]>; age: Sec<Dist[]>; country: Sec<Dist[]>; city: Sec<Dist[]> };
};

export async function buildReport(c: Creds, blogId: number, range: Range): Promise<Report> {
  const prev = prevRange(range), iso = (d: string, end?: boolean) => `${d}T${end ? "23:59:59" : "00:00:00"}`;
  const list = (path: string, kind: Content["kind"]) => sec(async () => arr(((await mc(c, path, { blogId, from: iso(range.from), to: iso(range.to, true) }, TTL)) as Json)?.data).map((r) => normalizeContent(kind, r)));
  const dist = (what: string) => sec(async () => toDist(await mc(c, `/stats/${what}/instagram`, { blogId }, TTL))); // current audience, no date range
  const keys = METRICS.map((m) => m.key);
  const [series, posts, reels, stories, gender, age, country, city] = await Promise.all([
    Promise.all(METRICS.map((m) => sec(async () => parseSeries(await mc(c, "/v2/analytics/timelines", { network: "instagram", subject: m.subject, metric: m.metric, blogId, from: iso(prev.from), to: iso(range.to, true) }, TTL))))),
    list("/v2/analytics/posts/instagram", "post"), list("/v2/analytics/reels/instagram", "reel"), list("/v2/analytics/stories/instagram", "story"),
    dist("gender"), dist("age"), dist("country"), dist("city"),
  ]);
  return { range, prev, series: Object.fromEntries(keys.map((k, i) => [k, series[i]])), content: { posts, reels, stories }, audience: { gender, age, country, city } };
}

/** The same report as flat rows (account, section, item, date, metric, value), for the CSV export. */
export function reportRows(account: string, r: Report): (string | number)[][] {
  const out: (string | number)[][] = [];
  for (const m of METRICS) {
    const s = r.series[m.key];
    if (!s.ok) continue;
    const cur = periodValue(s.data, r.range, m.kind), prev = periodValue(s.data, r.prev, m.kind);
    out.push([account, "summary", m.group, "", `${m.label} (${m.kind === "avg" ? "daily average" : m.kind === "last" ? "latest" : "total"})`, cur ?? ""], [account, "summary", m.group, "", `${m.label} previous period`, prev ?? ""]);
    for (const p of s.data) if (p.t >= r.range.from && p.t <= r.range.to) out.push([account, "daily", m.group, p.t, m.label, p.v]);
  }
  for (const [name, sec_] of Object.entries(r.content)) if (sec_.ok) for (const c of sec_.data) for (const [k, v] of Object.entries(c.stats)) out.push([account, `content ${name}`, c.url ?? c.id, c.at?.slice(0, 10) ?? "", k, v]);
  for (const [name, sec_] of Object.entries(r.audience)) if (sec_.ok) for (const d of sec_.data) out.push([account, "audience", name, "", d.key, d.value]);
  return out;
}

// A text cell starting with = + - @ would run as a formula in Excel, so it gets a leading apostrophe. Real numbers (negatives included) are left alone.
const cell = (x: string | number) => {
  const s = String(x), t = typeof x === "string" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
export const toCsv = (rows: (string | number)[][]) => ["account,section,item,date,metric,value", ...rows.map((r) => r.map(cell).join(","))].join("\r\n");
