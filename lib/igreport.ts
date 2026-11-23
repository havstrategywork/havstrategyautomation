// Instagram report for one connected account, read straight from Meta's Instagram Insights API (the data Meta Business Suite shows).
// Meta returns TOTALS for a period (not a value per day), so: totals + breakdowns + audience + content are fetched live here, and the daily
// charts are drawn from rows a daily job stores (lib/igstore.ts). Every section is fetched independently, so one failing call shows its own error.
import { graphGet, MetaError } from "./meta.ts";

export type Range = { from: string; to: string }; // YYYY-MM-DD, both days included
export type Pt = { t: string; v: number };
export type Sec<T> = { ok: true; data: T } | { ok: false; error: string };
export type Dist = { key: string; value: number };
export type Content = { id: string; kind: "post" | "reel" | "story"; url?: string; img?: string; text?: string; at?: string; stats: Record<string, number> };

// "unique" metrics count distinct accounts, so they can't be added across separate windows; "sum" metrics can.
export type TotalMetric = { key: string; label: string; kind: "sum" | "unique" };
export const TOTALS: TotalMetric[] = [
  { key: "reach", label: "Accounts reached", kind: "unique" },
  { key: "views", label: "Views", kind: "sum" },
  { key: "accounts_engaged", label: "Accounts engaged", kind: "unique" },
  { key: "total_interactions", label: "Interactions", kind: "sum" },
  { key: "likes", label: "Likes", kind: "sum" },
  { key: "comments", label: "Comments", kind: "sum" },
  { key: "saves", label: "Saves", kind: "sum" },
  { key: "shares", label: "Shares", kind: "sum" },
  { key: "replies", label: "Story replies", kind: "sum" },
  { key: "reposts", label: "Reposts", kind: "sum" },
  { key: "profile_links_taps", label: "Profile link taps", kind: "sum" },
];
export const SPLIT_METRICS = ["views", "reach", "total_interactions"]; // support the media_product_type breakdown

// ---- dates (plain YYYY-MM-DD strings; UTC maths so a timezone never shifts a day) ----
const DAY = 864e5, ISO = /^\d{4}-\d{2}-\d{2}$/;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) => new Date(ms(d) + n * DAY).toISOString().slice(0, 10);
export const days = (r: Range) => Math.round((ms(r.to) - ms(r.from)) / DAY) + 1;
export const prevRange = (r: Range): Range => ({ from: addDays(r.from, -days(r)), to: addDays(r.from, -1) });
export const todayIn = (tz = "Asia/Kolkata") => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
/** Unix seconds for the start (or the very last second) of a day. */
export const unix = (d: string, end = false) => Math.floor((ms(d) + (end ? DAY : 0)) / 1000) - (end ? 1 : 0);
/** Splits a range into windows of at most `size` days (Meta limits how long one insights request may span). */
export function windows(r: Range, size = 30): Range[] {
  const out: Range[] = [];
  for (let from = r.from; from <= r.to; from = addDays(from, size)) out.push({ from, to: addDays(from, size - 1) < r.to ? addDays(from, size - 1) : r.to });
  return out;
}

/** ?range=7|30|90 or custom ?from=&to=. Anything invalid falls back to the last 30 days; a custom range is capped at 90 days (what Meta keeps) and can't end in the future. */
export function parseRange(sp: { range?: string; from?: string; to?: string }, today: string): { range: Range; preset: string } {
  const n = Number(sp.range);
  if ([7, 30, 90].includes(n)) return { range: { from: addDays(today, -(n - 1)), to: today }, preset: String(n) };
  if (sp.from && sp.to && ISO.test(sp.from) && ISO.test(sp.to) && !Number.isNaN(ms(sp.from)) && !Number.isNaN(ms(sp.to))) {
    const to = sp.to > today ? today : sp.to;
    const from = sp.from > to ? to : sp.from;
    return { range: { from: days({ from, to }) > 90 ? addDays(to, -89) : from, to }, preset: "custom" };
  }
  return { range: { from: addDays(today, -29), to: today }, preset: "30" };
}

// ---- parsing (pure) ----
type Json = Record<string, unknown>;
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : Number(x) || 0);
const arr = (x: unknown): Json[] => (Array.isArray(x) ? (x as Json[]) : []);
const obj = (x: unknown): Json => (x && typeof x === "object" && !Array.isArray(x) ? (x as Json) : {});
const str = (x: unknown) => (typeof x === "string" && x ? x : undefined);

/** { data: [ { name, total_value: { value } } ] } (or { values: [ { value } ] }) -> { name: value }. A metric Meta leaves out (no data) is simply absent, never 0. */
export function parseTotals(resp: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of arr(obj(resp).data)) {
    const v = obj(m.total_value).value ?? arr(m.values)[0]?.value;
    if (typeof m.name === "string" && v !== undefined && v !== null) out[m.name] = num(v);
  }
  return out;
}

/** Breakdown answers: { data: [ { name, total_value: { breakdowns: [ { results: [ { dimension_values, value } ] } ] } } ] } -> { name: [ {key, value} ] }, biggest first.
 *  The key is the LAST dimension value (Meta lists "timeframe" first for demographics). */
export function parseBreakdown(resp: unknown): Record<string, Dist[]> {
  const out: Record<string, Dist[]> = {};
  for (const m of arr(obj(resp).data)) {
    const acc = new Map<string, number>();
    for (const r of arr(obj(arr(obj(m.total_value).breakdowns)[0]).results)) {
      const dv = Array.isArray(r.dimension_values) ? (r.dimension_values as unknown[]) : [], key = String(dv[dv.length - 1] ?? "");
      if (key) acc.set(key, (acc.get(key) ?? 0) + num(r.value));
    }
    if (typeof m.name === "string") out[m.name] = [...acc].map(([key, value]) => ({ key, value })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  }
  return out;
}

const GENDER: Record<string, string> = { F: "Female", M: "Male", U: "Unknown" }, PRODUCT: Record<string, string> = { POST: "Posts", CAROUSEL_CONTAINER: "Carousels", REEL: "Reels", REELS: "Reels", STORY: "Stories", AD: "Ads", FEED: "Feed" };
const regions = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames("en", { type: "region" }) : undefined;
export const label = (kind: "gender" | "country" | "format", key: string) => (kind === "gender" ? GENDER[key] : kind === "format" ? PRODUCT[key] : /^[A-Z]{2}$/.test(key) ? (() => { try { return regions?.of(key); } catch { return undefined; } })() : undefined) ?? key;

const insightsOf = (r: Json): Record<string, number> => parseTotals(r.insights);
const when = (x: unknown) => (typeof x === "string" ? x : undefined);

/** A feed post or reel from GET /<IG_ID>/media with insights.metric(reach,views,shares,total_interactions) expanded. */
export function normalizeMedia(r: Json): Content {
  const i = insightsOf(r), reel = String(r.media_product_type ?? "").toUpperCase().startsWith("REEL");
  return { id: String(r.id ?? r.permalink ?? Math.random()), kind: reel ? "reel" : "post", url: str(r.permalink), img: str(r.thumbnail_url) ?? str(r.media_url), text: str(r.caption), at: when(r.timestamp),
    stats: { ...(r.like_count !== undefined && { likes: num(r.like_count) }), ...(r.comments_count !== undefined && { comments: num(r.comments_count) }), ...(i.reach !== undefined && { reach: i.reach }), ...(i.views !== undefined && { views: i.views }), ...(i.shares !== undefined && { shares: i.shares }), ...(i.total_interactions !== undefined && { interactions: i.total_interactions }) } };
}
export function normalizeStory(r: Json): Content {
  const i = insightsOf(r);
  return { id: String(r.id ?? r.permalink ?? Math.random()), kind: "story", url: str(r.permalink), img: str(r.thumbnail_url) ?? str(r.media_url), text: str(r.caption), at: when(r.timestamp),
    stats: { ...(i.reach !== undefined && { reach: i.reach }), ...(i.views !== undefined && { views: i.views }), ...(i.shares !== undefined && { shares: i.shares }), ...(i.total_interactions !== undefined && { interactions: i.total_interactions }), ...(i.replies !== undefined && { replies: i.replies }) } };
}
export const topBy = (items: Content[], key: string, n = 6) => [...items].sort((a, b) => (b.stats[key] ?? 0) - (a.stats[key] ?? 0)).slice(0, n);

// ---- period numbers ----
export const pctChange = (cur: number | null | undefined, prev: number | null | undefined) => (cur == null || prev == null || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100);

/** Adds up the windows of a long range. Distinct-account metrics (reach, accounts engaged) can't be added, so they become the average per window. */
export function combineWindows(parts: Record<string, number>[]): { values: Record<string, number>; windows: number } {
  const values: Record<string, number> = {};
  for (const m of TOTALS) {
    const have = parts.map((p) => p[m.key]).filter((v): v is number => v !== undefined);
    if (have.length) values[m.key] = have.reduce((a, b) => a + b, 0) / (m.kind === "unique" ? have.length : 1);
  }
  return { values, windows: parts.length };
}

// ---- fetching (every call carries the token in a header; see lib/meta.ts) ----
const TTL = 5 * 60e3;
const sec = async <T,>(f: () => Promise<T>): Promise<Sec<T>> => {
  try { return { ok: true, data: await f() }; }
  catch (e) { return { ok: false, error: e instanceof MetaError ? e.message : "Unexpected answer from Meta." }; }
};
const win = (r: Range) => ({ since: String(unix(r.from)), until: String(unix(r.to, true)) });
const insights = (id: string, token: string, params: Record<string, string>) => graphGet<unknown>(`/${id}/insights`, token, params, TTL);

/** Totals for one window. All metrics in one call; if Meta rejects the combination, each metric on its own so one unsupported metric can't hide the rest. */
export async function getTotals(token: string, igId: string, r: Range, metrics = TOTALS.map((m) => m.key)): Promise<Record<string, number>> {
  const base = { period: "day", metric_type: "total_value", ...win(r) };
  try { return parseTotals(await insights(igId, token, { ...base, metric: metrics.join(",") })); }
  catch (first) {
    if (!(first instanceof MetaError) || metrics.length === 1) throw first;
    const out: Record<string, number> = {}; let attempt = 0;
    for (const m of metrics) {
      attempt++;
      try { Object.assign(out, parseTotals(await insights(igId, token, { ...base, metric: m }))); }
      catch (e) { if (attempt === 1 && e instanceof MetaError && e.message === first.message) throw first; } // the very first single metric failing the same way means it is systemic (token, permission): stop
    }
    if (!Object.keys(out).length) throw first;
    return out;
  }
}
const periodTotals = async (token: string, igId: string, r: Range) => combineWindows(await Promise.all(windows(r).map((w) => getTotals(token, igId, w))));

export type Account = { username?: string; followers?: number; following?: number; media?: number };
export type Report = {
  range: Range; prev: Range;
  account: Sec<Account>;
  totals: Sec<{ cur: Record<string, number>; prev: Record<string, number>; windows: number }>;
  split: Sec<Record<string, Dist[]>>; // views / reach / interactions by format, for the last 30 days of the range
  media: Sec<Content[]>;
  audience: { gender: Sec<Dist[]>; age: Sec<Dist[]>; country: Sec<Dist[]>; city: Sec<Dist[]> };
};

export async function buildReport(token: string, igId: string, range: Range): Promise<Report> {
  const prev = prevRange(range), last30 = windows(range).at(-1)!;
  const demo = (breakdown: string, kind?: "gender" | "country") => sec(async () => (parseBreakdown(await insights(igId, token, { metric: "follower_demographics", period: "lifetime", metric_type: "total_value", timeframe: "this_month", breakdown }))["follower_demographics"] ?? []).map((d) => ({ ...d, key: kind ? label(kind, d.key) : d.key })));
  const [account, totals, split, media, gender, age, country, city] = await Promise.all([
    sec(async () => { const a = await graphGet<Json>(`/${igId}`, token, { fields: "username,followers_count,follows_count,media_count" }, TTL); return { username: str(a.username), followers: a.followers_count === undefined ? undefined : num(a.followers_count), following: a.follows_count === undefined ? undefined : num(a.follows_count), media: a.media_count === undefined ? undefined : num(a.media_count) }; }),
    sec(async () => { const [cur, p] = await Promise.all([periodTotals(token, igId, range), periodTotals(token, igId, prev)]); return { cur: cur.values, prev: p.values, windows: cur.windows }; }),
    sec(async () => parseBreakdown(await insights(igId, token, { metric: SPLIT_METRICS.join(","), period: "day", metric_type: "total_value", breakdown: "media_product_type", ...win(last30) }))),
    sec(async () => arr(obj(await graphGet<unknown>(`/${igId}/media`, token, { fields: "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count,insights.metric(reach,views,shares,total_interactions)", since: String(unix(range.from)), until: String(unix(range.to, true)), limit: "50" }, TTL)).data).map(normalizeMedia)),
    demo("gender", "gender"), demo("age"), demo("country", "country"), demo("city"),
  ]);
  return { range, prev, account, totals, split, media, audience: { gender, age, country, city } };
}

/** Stories only exist for 24 hours, so the daily job saves them; this reads the live ones. */
export const liveStories = async (token: string, igId: string) =>
  arr(obj(await graphGet<unknown>(`/${igId}/stories`, token, { fields: "id,caption,media_type,permalink,thumbnail_url,media_url,timestamp,insights.metric(reach,views,shares,total_interactions,replies)" }, 60e3)).data).map(normalizeStory);

// ---- daily history (rows stored by lib/igstore.ts) ----
export type DailyLike = { date: string; m: Record<string, number>; followers?: number };
export const seriesFrom = (rows: DailyLike[], key: string, r: Range): Pt[] => rows.filter((x) => x.date >= r.from && x.date <= r.to && x.m[key] !== undefined).map((x) => ({ t: x.date, v: x.m[key] })).sort((a, b) => a.t.localeCompare(b.t));
export const followerSeries = (rows: DailyLike[], r: Range): Pt[] => rows.filter((x) => x.date >= r.from && x.date <= r.to && x.followers !== undefined).map((x) => ({ t: x.date, v: x.followers! })).sort((a, b) => a.t.localeCompare(b.t));

/** The report as flat rows (account, section, item, date, metric, value) for the CSV export. */
export function reportRows(account: string, r: Report, daily: DailyLike[], stories: Content[]): (string | number)[][] {
  const out: (string | number)[][] = [];
  if (r.totals.ok) for (const m of TOTALS) { const c = r.totals.data.cur[m.key], p = r.totals.data.prev[m.key]; if (c !== undefined) out.push([account, "summary", "", "", `${m.label}${r.totals.data.windows > 1 && m.kind === "unique" ? " (average per 30 days)" : ""}`, c], [account, "summary", "", "", `${m.label} previous period`, p ?? ""]); }
  for (const m of TOTALS) for (const p of seriesFrom(daily, m.key, r.range)) out.push([account, "daily", "", p.t, m.label, p.v]);
  for (const p of followerSeries(daily, r.range)) out.push([account, "daily", "", p.t, "Followers", p.v]);
  if (r.split.ok) for (const [metric, rows] of Object.entries(r.split.data)) for (const d of rows) out.push([account, "by format", label("format", d.key), "", metric, d.value]);
  const items = [...(r.media.ok ? r.media.data : []), ...stories];
  for (const c of items) for (const [k, v] of Object.entries(c.stats)) out.push([account, `content ${c.kind}`, c.url ?? c.id, c.at?.slice(0, 10) ?? "", k, v]);
  for (const [name, s] of Object.entries(r.audience)) if (s.ok) for (const d of s.data) out.push([account, "audience", name, "", d.key, d.value]);
  return out;
}

// A text cell starting with = + - @ would run as a formula in Excel, so it gets a leading apostrophe. Real numbers (negatives included) are left alone.
const cell = (x: string | number) => {
  const s = String(x), t = typeof x === "string" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
export const toCsv = (rows: (string | number)[][]) => ["account,section,item,date,metric,value", ...rows.map((r) => r.map(cell).join(","))].join("\r\n");
